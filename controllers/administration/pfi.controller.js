const asyncHandler = require("express-async-handler");
const {
  pfiRepo,
  pfiExpenseRepo,
  depotRepo,
  lpgStationRepo,
  productRepo,
  staffRepo,
  orderRepo,
} = require("../../repositories");
const { computeFinancials } = require("../../lib/pfiFinance");
const { resolveBooking, actorFor, vendorFor } = require("./expense.controller");
const { isWithinScope } = require("../../lib/scopeFilter");

function httpErr(status, message) {
  return Object.assign(new Error(message), { status });
}

/**
 * Attach the money figures to one PFI or a list of them.
 *
 * Aggregates are fetched for the whole page in three grouped queries rather
 * than a dozen per row — the difference between a list that renders instantly
 * and one that takes seconds once there are a few dozen batches.
 */
const withFinancials = async (rows) => {
  const many = Array.isArray(rows);
  const list = many ? rows : [rows];
  const aggs = await pfiExpenseRepo.aggregatesFor(list.map((p) => p.id));
  const decorated = list.map((pfi) => {
    const agg = aggs.get(Number(pfi.id)) || {};
    return {
      ...pfi,
      financials: computeFinancials(pfi, agg),
      orderCount: agg.orderCount || 0,
      expenseCount: agg.expenseCount || 0,
    };
  });
  return many ? decorated : decorated[0];
};

const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const resolveOfficerName = async (id) => {
  if (!id) return "";
  try {
    const admin = await staffRepo.findById(id);
    if (!admin) return "";
    return `${admin.firstName || ""} ${admin.surname || ""}`.trim();
  } catch {
    return "";
  }
};

const getPfis = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 100, location, type } = req.query;

  const result = await pfiRepo.findAll({ search, status, location, type, scopeUser: req.user, page, limit });
  result.pfis = await withFinancials(result.pfis || []);

  res.json({ success: true, data: result });
});

const getPfiById = asyncHandler(async (req, res) => {
  const found = await pfiRepo.findById(req.params.id);

  if (!found) {
    return res.status(404).json({ success: false, message: "PFI not found" });
  }

  // The drawer needs the lines behind the totals, not just the totals.
  const [pfi, expenses, movements] = await Promise.all([
    withFinancials(found),
    pfiExpenseRepo.listExpensesForPfi(found.id),
    pfiExpenseRepo.listMovements(found.id),
  ]);

  res.json({ success: true, data: { pfi, expenses, movements } });
});

/**
 * "coastal" unless the body explicitly says gantry.
 *
 * Anything unrecognised falls back to coastal rather than 400-ing: the column
 * defaults to coastal, every existing row is coastal, and a client that has not
 * been taught about types yet must keep creating the kind it always did.
 */
const normalisePfiType = (raw) =>
  String(raw || "").trim().toLowerCase() === "gantry" ? "gantry" : "coastal";

const createPfi = asyncHandler(async (req, res) => {
  const pfi_number = req.body.pfi_number || req.body.pfiNumber;
  const description = req.body.description || "";
  const pfi_date = req.body.pfi_date || req.body.pfiDate;
  const location_id = req.body.location_id || req.body.locationId;
  const product_id = req.body.product_id || req.body.productId;
  const starting_qty_litres = req.body.starting_qty_litres ?? req.body.startingQtyLitres;
  const bl_qty_litres = req.body.bl_qty_litres ?? req.body.blQtyLitres;
  const bl_qty_mt = req.body.bl_qty_mt ?? req.body.blQtyMt;
  const qty_volume_mt = req.body.qty_volume_mt ?? req.body.qtyVolumeMt;
  const unit_price = req.body.unit_price ?? req.body.unitPrice;
  const credit_balance = req.body.credit_balance ?? req.body.creditBalance;
  const audit_officer = req.body.audit_officer || req.body.auditOfficerId;
  const product_officer = req.body.product_officer || req.body.productOfficerId;
  const it_compliance_officer = req.body.it_compliance_officer || req.body.itComplianceOfficerId;
  const security_exit_officer = req.body.security_exit_officer || req.body.securityExitOfficerId;
  const commission_officer = req.body.commission_officer || req.body.commissionOfficerId;
  const sales_manager = req.body.sales_manager || req.body.salesManagerId;
  const vessel_broker = req.body.vessel_broker || req.body.vesselBroker;
  const vessel_name = req.body.vessel_name || req.body.vesselName;
  const surveyor_name = req.body.surveyor_name || req.body.surveyorName;
  const surveyor_phone = req.body.surveyor_phone || req.body.surveyorPhone;
  const pfi_type = normalisePfiType(req.body.pfi_type ?? req.body.pfiType);
  const ticket_count = req.body.ticket_count ?? req.body.ticketCount;

  // A gantry batch has no shipping papers and no vessel. Dropping these here
  // rather than trusting the client means a form that once sent them cannot
  // leave a gantry row carrying a BL figure it will then be costed against.
  const isGantry = pfi_type === "gantry";

  if (!pfi_number) {
    return res.status(400).json({ success: false, message: "PFI number is required" });
  }

  const existing = await pfiRepo.findByNumber(String(pfi_number).trim());
  if (existing) {
    return res.status(409).json({ success: false, message: "A PFI with this number already exists" });
  }

  let location_name = "";
  let location_id_val = null;

  if (location_id) {
    location_id_val = parseInt(location_id, 10) || location_id;
    if (!isWithinScope(req.user, "depotIds", location_id_val)) {
      return res.status(403).json({ success: false, message: "You cannot create a PFI for this location" });
    }
    const depot = await depotRepo.findById(location_id_val);
    if (depot) location_name = depot.name;
  }

  let product_name = "";
  let product_unit = "Litres";
  if (product_id) {
    const prod = await productRepo.findById(product_id);
    if (prod) {
      product_name = prod.name;
      product_unit = prod.unit || "Litres";
    }
  }

  const officerDefs = [
    { field: "audit_officer", idKey: "auditOfficerId", nameKey: "auditOfficerName" },
    { field: "product_officer", idKey: "productOfficerId", nameKey: "productOfficerName" },
    { field: "it_compliance_officer", idKey: "itComplianceOfficerId", nameKey: "itComplianceOfficerName" },
    { field: "security_exit_officer", idKey: "securityExitOfficerId", nameKey: "securityExitOfficerName" },
    { field: "commission_officer", idKey: "commissionOfficerId", nameKey: "commissionOfficerName" },
    { field: "sales_manager", idKey: "salesManagerId", nameKey: "salesManagerName" },
  ];

  const officerNames = {};
  for (const { field, idKey, nameKey } of officerDefs) {
    const val = req.body[field] || req.body[idKey] || req.body[`${field}_id`];
    officerNames[nameKey] = await resolveOfficerName(val);
  }

  const pfi = await pfiRepo.create({
    pfiNumber: String(pfi_number).trim(),
    pfiType: pfi_type,
    description: description || "",
    pfiDate: parseDate(pfi_date),
    locationId: location_id_val,
    lpgStationId: null,
    locationName: location_name,
    productId: product_id ? (parseInt(product_id, 10) || product_id) : null,
    productName: product_name,
    productUnit: req.body.product_unit || req.body.productUnit || product_unit || "Litres",
    startingQtyLitres: Number(starting_qty_litres) || 0,
    // Left null when not supplied — an unknown BL must not read as zero, or
    // every money figure downstream would silently compute against it.
    blQtyLitres:
      isGantry || bl_qty_litres == null || bl_qty_litres === "" ? null : Number(bl_qty_litres),
    blQtyMt: isGantry || bl_qty_mt == null || bl_qty_mt === "" ? null : Number(bl_qty_mt),
    qtyVolumeMt: isGantry ? "0" : Number(qty_volume_mt) || 0,
    // Same "blank means unknown" rule: zero tickets is a real answer nobody
    // has given yet.
    ticketCount: ticket_count == null || ticket_count === "" ? null : Number(ticket_count),
    unitPrice: String(Number(unit_price) || 0),
    creditBalance: String(Number(credit_balance) || 0),
    auditOfficerId: audit_officer ? (parseInt(audit_officer, 10) || audit_officer) : null,
    productOfficerId: product_officer ? (parseInt(product_officer, 10) || product_officer) : null,
    itComplianceOfficerId: it_compliance_officer ? (parseInt(it_compliance_officer, 10) || it_compliance_officer) : null,
    securityExitOfficerId: security_exit_officer ? (parseInt(security_exit_officer, 10) || security_exit_officer) : null,
    commissionOfficerId: commission_officer ? (parseInt(commission_officer, 10) || commission_officer) : null,
    salesManagerId: sales_manager ? (parseInt(sales_manager, 10) || sales_manager) : null,
    ...officerNames,
    vesselBroker: isGantry ? "" : vessel_broker || "",
    vesselName: isGantry ? "" : vessel_name || "",
    surveyorName: isGantry ? "" : surveyor_name || "",
    surveyorPhone: isGantry ? "" : surveyor_phone || "",
  });

  // Every PFI becomes an expense category the moment it exists. Without this
  // there is no way to book a cost against the batch at all.
  await pfiExpenseRepo.ensureCategoryForPfi(pfi.id, pfi.pfiNumber);

  res.status(201).json({
    success: true,
    message: "PFI created successfully",
    data: { pfi: await withFinancials(pfi) },
  });
});

const updatePfi = asyncHandler(async (req, res) => {
  const pfi = await pfiRepo.findById(req.params.id);

  if (!pfi) {
    return res.status(404).json({ success: false, message: "PFI not found" });
  }

  const allowedFields = [
    "pfi_number", "description", "pfi_date", "status", "starting_qty_litres",
    "bl_qty_litres", "bl_qty_mt", "ticket_count",
    "qty_volume_mt", "sold_qty_litres", "total_amount", "unit_price", "credit_balance", "product_unit",
    "vessel_broker", "vessel_name", "surveyor_name", "surveyor_phone",
    "closure_date", "total_inflow", "closure_bank", "purchase_cost",
    "aggregate_expenses", "closure_handler", "closure_remarks",
  ];

  const updateData = {};
  for (const field of allowedFields) {
    const camelKey = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const value = req.body[field] !== undefined ? req.body[field] : req.body[camelKey];
    if (value !== undefined) {
      if (field === "pfi_date") {
        updateData.pfiDate = parseDate(value);
      } else if (field === "closure_date") {
        updateData.closureDate = parseDate(value);
      } else if (field === "bl_qty_litres") {
        // Blank clears it back to unknown rather than setting zero.
        updateData.blQtyLitres = value === "" || value === null ? null : Number(value);
      } else if (field === "bl_qty_mt") {
        // Same "blank means unknown" rule as bl_qty_litres.
        updateData.blQtyMt = value === "" || value === null ? null : Number(value);
      } else if (field === "ticket_count") {
        updateData.ticketCount = value === "" || value === null ? null : Number(value);
      } else {
        updateData[camelKey] = value;
      }
    }
  }

  // Switching a batch to gantry has to clear what stops applying, not just
  // stop showing it. A leftover BL figure would still be what pfiValue is
  // computed from, so the batch would keep reporting a cost against a document
  // it no longer has.
  const rawType = req.body.pfi_type ?? req.body.pfiType;
  const pfiType = rawType !== undefined ? normalisePfiType(rawType) : pfi.pfiType;
  if (rawType !== undefined) updateData.pfiType = pfiType;

  if (pfiType === "gantry") {
    Object.assign(updateData, {
      blQtyLitres: null,
      blQtyMt: null,
      qtyVolumeMt: "0",
      vesselBroker: "",
      vesselName: "",
      surveyorName: "",
      surveyorPhone: "",
    });
  } else if (rawType !== undefined) {
    // Coming back the other way, the ticket count is the gantry-only fact.
    updateData.ticketCount = null;
  }

  const customUnit = req.body.product_unit || req.body.productUnit;
  if (customUnit) {
    updateData.productUnit = customUnit;
  }

  if (req.body.location_id !== undefined || req.body.locationId !== undefined) {
    const locId = req.body.location_id !== undefined ? req.body.location_id : req.body.locationId;
    if (locId && locId !== "none") {
      const parsedLoc = parseInt(locId, 10) || locId;
      if (!isWithinScope(req.user, "depotIds", parsedLoc)) {
        return res.status(403).json({ success: false, message: "You cannot move this PFI to a location outside your scope" });
      }
      updateData.locationId = parsedLoc;
      updateData.lpgStationId = null;
      const depot = await depotRepo.findById(parsedLoc);
      updateData.locationName = depot ? depot.name : "";
    } else {
      updateData.locationId = null;
      updateData.locationName = "";
    }
  }

  if (req.body.product_id !== undefined || req.body.productId !== undefined) {
    const prodId = req.body.product_id !== undefined ? req.body.product_id : req.body.productId;
    if (prodId) {
      const parsedProd = parseInt(prodId, 10) || prodId;
      updateData.productId = parsedProd;
      const prod = await productRepo.findById(parsedProd);
      if (prod) {
        updateData.productName = prod.name;
        if (!customUnit) {
          updateData.productUnit = prod.unit || "Litres";
        }
      }
    }
  }

  const officerDefs = [
    { field: "audit_officer", idKey: "auditOfficerId", nameKey: "auditOfficerName" },
    { field: "product_officer", idKey: "productOfficerId", nameKey: "productOfficerName" },
    { field: "it_compliance_officer", idKey: "itComplianceOfficerId", nameKey: "itComplianceOfficerName" },
    { field: "security_exit_officer", idKey: "securityExitOfficerId", nameKey: "securityExitOfficerName" },
    { field: "commission_officer", idKey: "commissionOfficerId", nameKey: "commissionOfficerName" },
    { field: "sales_manager", idKey: "salesManagerId", nameKey: "salesManagerName" },
  ];

  for (const { field, idKey, nameKey } of officerDefs) {
    const val =
      req.body[idKey] !== undefined
        ? req.body[idKey]
        : req.body[`${field}_id`] !== undefined
        ? req.body[`${field}_id`]
        : req.body[field] !== undefined
        ? req.body[field]
        : undefined;

    if (val !== undefined) {
      const numericVal = val ? (parseInt(val, 10) || val) : null;
      updateData[idKey] = numericVal;
      updateData[nameKey] = await resolveOfficerName(val);
    }
  }

  const updated = await pfiRepo.update(pfi.id, updateData);

  // The category is named after the PFI, so a renumbered PFI renames it. It is
  // also created here if missing, which covers rows predating the table.
  if (updated.pfiNumber !== pfi.pfiNumber) {
    const renamed = await pfiExpenseRepo.renameCategoryForPfi(updated.id, updated.pfiNumber);
    if (!renamed) await pfiExpenseRepo.ensureCategoryForPfi(updated.id, updated.pfiNumber);
  }

  res.json({
    success: true,
    message: "PFI updated successfully",
    data: { pfi: await withFinancials(updated) },
  });
});

const deletePfi = asyncHandler(async (req, res) => {
  const pfi = await pfiRepo.findById(req.params.id);

  if (!pfi) {
    return res.status(404).json({ success: false, message: "PFI not found" });
  }

  const orderCount = await orderRepo.countByPfi(pfi.id);
  if (orderCount > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete PFI: it is referenced by ${orderCount} order(s)`,
    });
  }

  await pfiRepo.deleteById(pfi.id);

  res.json({ success: true, message: "PFI deleted successfully" });
});

/**
 * Close a batch out.
 *
 * The closure figures are typed in by hand while the system already computes
 * the same quantities from the actual data. We keep both — the manual numbers
 * are what the closing statement was signed against — but the response returns
 * the computed pair alongside so a mismatch is visible at the moment of
 * closing rather than discovered later.
 */
const finishPfi = asyncHandler(async (req, res) => {
  const pfi = await pfiRepo.findById(req.params.id);
  if (!pfi) throw httpErr(404, "PFI not found");
  if (pfi.status === "finished") throw httpErr(409, "This PFI is already closed");

  const updateData = { status: "finished", closureDate: parseDate(req.body.closure_date ?? req.body.closureDate) || new Date() };

  const map = {
    total_inflow: "totalInflow",
    closure_bank: "closureBank",
    purchase_cost: "purchaseCost",
    aggregate_expenses: "aggregateExpenses",
    closure_handler: "closureHandler",
    closure_remarks: "closureRemarks",
  };
  for (const [snake, camel] of Object.entries(map)) {
    const value = req.body[snake] !== undefined ? req.body[snake] : req.body[camel];
    if (value !== undefined && value !== null && value !== "") {
      updateData[camel] = ["totalInflow", "purchaseCost", "aggregateExpenses"].includes(camel)
        ? String(Number(value) || 0)
        : value;
    }
  }

  const updated = await withFinancials(await pfiRepo.update(pfi.id, updateData));

  // Nothing reconciles the manual closure figures against the computed ones,
  // so surface the gap instead of leaving two answers to the same question.
  const f = updated.financials;
  const discrepancies = [];
  const compare = (label, typed, computed) => {
    const t = Number(typed);
    if (!Number.isFinite(t) || t === 0 || computed == null) return;
    if (Math.abs(t - computed) >= 0.01) {
      discrepancies.push({ label, entered: t, computed, difference: Number((t - computed).toFixed(2)) });
    }
  };
  compare("Purchase cost", updated.purchaseCost, f.pfiValue);
  compare("Aggregate expenses", updated.aggregateExpenses, f.totalExpenses);

  // Closing with stock still on the books usually means releases were never
  // recorded, not that the product vanished.
  const warnings = [];
  if (f.remaining > 0) {
    warnings.push(
      `${f.remaining.toLocaleString()} L still shows as remaining. Either that stock is genuinely unsold, or movements were never recorded against it.`
    );
  }

  res.json({
    success: true,
    message: "PFI closed",
    data: { pfi: updated, discrepancies, warnings },
  });
});

/** Just the money, for a drawer or a card that does not need the whole record. */
const getPfiSummary = asyncHandler(async (req, res) => {
  const pfi = await pfiRepo.findById(req.params.id);
  if (!pfi) throw httpErr(404, "PFI not found");

  const decorated = await withFinancials(pfi);
  res.json({
    success: true,
    data: {
      pfiNumber: decorated.pfiNumber,
      status: decorated.status,
      orderCount: decorated.orderCount,
      expenseCount: decorated.expenseCount,
      ...decorated.financials,
    },
  });
});

const getPfiExpenses = asyncHandler(async (req, res) => {
  const pfi = await pfiRepo.findById(req.params.id);
  if (!pfi) throw httpErr(404, "PFI not found");

  const expenses = await pfiExpenseRepo.listExpensesForPfi(pfi.id);
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  res.json({ success: true, data: { expenses, total } });
});

/**
 * Quick-add from inside the PFI drawer.
 *
 * The PFI comes from the URL, so a line added here is indistinguishable from
 * one added on the expenses page — same row, same stamped `pfi_id`, same audit
 * entry. A GL account named in the body is used when there is one; without it
 * the line falls back to this PFI's own category, where every pre-chart row
 * already sits.
 */
const addPfiExpense = asyncHandler(async (req, res) => {
  const pfi = await pfiRepo.findById(req.params.id);
  if (!pfi) throw httpErr(404, "PFI not found");

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 0) throw httpErr(400, "Amount must be a positive number");

  const requested = req.body.category_id ?? req.body.categoryId;
  const category = requested
    ? await pfiExpenseRepo.findCategoryById(requested)
    : await pfiExpenseRepo.ensureCategoryForPfi(pfi.id, pfi.pfiNumber);
  if (!category) throw httpErr(400, "Could not resolve this PFI's expense category");

  const { pfiId } = await resolveBooking(category.id, pfi.id);
  const { actorId, actorName } = await actorFor(req);
  const { vendorId, vendorName } = await vendorFor(req.body);

  const expense = await pfiExpenseRepo.createExpense({
    pfi_id: pfiId,
    category_id: category.id,
    expense_date:
      parseDate(req.body.expense_date ?? req.body.expenseDate)?.toISOString?.() ||
      new Date().toISOString(),
    vendor: vendorName,
    vendor_id: vendorId,
    description: req.body.description || "",
    amount: String(amount),
    bank_paid_from: req.body.bank_paid_from ?? req.body.bankPaidFrom ?? "",
    entered_by: actorName,
    recorded_by: actorId,
  });

  await pfiExpenseRepo.writeAudit({
    expenseId: expense.id,
    action: "create",
    changes: expense,
    actorId,
    actorName,
  });

  res.status(201).json({ success: true, message: "Expense recorded", data: { expense } });
});

/** Stock position across every PFI, for the allocation view. */
const getStockSummary = asyncHandler(async (req, res) => {
  const { status = "active" } = req.query;
  const result = await pfiRepo.findAll({ status: status === "all" ? undefined : status, limit: 200 });
  const decorated = await withFinancials(result.pfis || []);

  const rows = decorated.map((p) => ({
    id: p.id,
    pfiNumber: p.pfiNumber,
    status: p.status,
    locationName: p.locationName,
    productName: p.productName,
    tankQtyLitres: p.financials.tankQtyLitres,
    blQtyLitres: p.financials.blQtyLitres,
    surplusDeficitLitres: p.financials.surplusDeficitLitres,
    sold: p.financials.sold,
    remaining: p.financials.remaining,
    sellThrough: p.financials.sellThrough,
  }));

  res.json({
    success: true,
    data: {
      stock: rows,
      totals: {
        tank: rows.reduce((s, r) => s + r.tankQtyLitres, 0),
        sold: rows.reduce((s, r) => s + r.sold, 0),
        remaining: rows.reduce((s, r) => s + r.remaining, 0),
      },
    },
  });
});

/**
 * Bulk-assign orders to a PFI.
 *
 * Each order is checked independently and reported on independently — one bad
 * order in a batch of forty must not cost you the other thirty-nine.
 */
const assignOrdersToPfi = asyncHandler(async (req, res) => {
  const pfiId = req.body.pfi_id ?? req.body.pfiId;
  const orderIds = Array.isArray(req.body.order_ids ?? req.body.orderIds)
    ? req.body.order_ids ?? req.body.orderIds
    : [];

  if (!pfiId) throw httpErr(400, "A PFI is required");
  if (orderIds.length === 0) throw httpErr(400, "Select at least one order");

  const pfi = await pfiRepo.findById(pfiId);
  if (!pfi) throw httpErr(404, "PFI not found");
  // A finished batch has been closed out; assigning to it would move figures
  // that have already been reported.
  if (pfi.status !== "active") throw httpErr(400, "This PFI is not active");

  const allowed = new Set(
    [pfi.locationId, ...(Array.isArray(pfi.allowedLocations) ? pfi.allowedLocations : [])]
      .filter((v) => v != null)
      .map(Number)
  );

  const assigned = [];
  const errors = [];

  for (const rawId of orderIds) {
    const orderId = Number(rawId);
    try {
      const order = await orderRepo.findById(orderId);
      if (!order) {
        errors.push({ orderId: rawId, error: "Order not found" });
        continue;
      }
      // The depot must be one the batch can serve.
      if (allowed.size > 0 && !allowed.has(Number(order.depotId))) {
        errors.push({
          orderId: rawId,
          orderNumber: order.orderNumber,
          error: `Order is at a location this PFI does not cover`,
        });
        continue;
      }
      // A PFI is one product. An order carrying anything else cannot belong
      // to it, and a multi-product order can never belong to one at all.
      if (pfi.productId && Number(order.productId) !== Number(pfi.productId)) {
        errors.push({
          orderId: rawId,
          orderNumber: order.orderNumber,
          error: `Order product does not match this PFI's product (${pfi.productName})`,
        });
        continue;
      }
      if (order.pfiId && Number(order.pfiId) === Number(pfi.id)) {
        assigned.push({ orderId, orderNumber: order.orderNumber, alreadyAssigned: true });
        continue;
      }

      await orderRepo.update(orderId, { pfiId: Number(pfi.id) });
      assigned.push({ orderId, orderNumber: order.orderNumber });
    } catch (err) {
      errors.push({ orderId: rawId, error: err.message || "Could not assign this order" });
    }
  }

  res.json({
    success: errors.length === 0,
    message:
      errors.length === 0
        ? `${assigned.length} order(s) assigned to ${pfi.pfiNumber}`
        : `${assigned.length} assigned, ${errors.length} could not be`,
    data: { assigned, errors, pfi: await withFinancials(await pfiRepo.findById(pfi.id)) },
  });
});

module.exports = {
  getPfis,
  getPfiById,
  createPfi,
  updatePfi,
  deletePfi,
  finishPfi,
  getPfiSummary,
  getPfiExpenses,
  addPfiExpense,
  getStockSummary,
  assignOrdersToPfi,
};
