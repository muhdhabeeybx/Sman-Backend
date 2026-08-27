const { dailyReportRepo, staffRepo } = require("../repositories");
const { emitEvent } = require("./events");

const UNIQUE_VIOLATION = "23505";
const isUniqueViolation = (err) =>
  err?.code === UNIQUE_VIOLATION || err?.cause?.code === UNIQUE_VIOLATION;

// price_bands is where the scalars come from when present; the scalar
// avgPrice and litresSold are derived from it so both representations agree
// unless the filer says otherwise (see resolveTotals).
const deriveFromBands = (priceBands, fallbackLitres, fallbackPrice) => {
  if (!Array.isArray(priceBands) || priceBands.length === 0) {
    return {
      litresSold: Number(fallbackLitres || 0),
      avgPrice: Number(fallbackPrice || 0),
      totalSalesAmount: Number(fallbackLitres || 0) * Number(fallbackPrice || 0),
    };
  }
  let litres = 0;
  let value = 0;
  for (const band of priceBands) {
    const bandLitres = Number(band.litres || 0);
    const bandPrice = Number(band.price || 0);
    litres += bandLitres;
    value += bandLitres * bandPrice;
  }
  return {
    litresSold: litres,
    avgPrice: litres > 0 ? value / litres : 0,
    totalSalesAmount: value,
  };
};

const stated = (v) => v !== undefined && v !== null && v !== "";

/**
 * The volume, value and price a report ends up recording.
 *
 * The price table answers all three when there is one: a day sold at several
 * prices is described by its rows, and letting a hand-typed total sit next to
 * rows that add up to something else is how the two came to disagree.
 *
 * A figure the filer actually sends still wins, though. The paper sheet is the
 * record: a dip that reads short of what the bands say is a fact about the
 * day, not an error to be arithmetic-ed away, and the form now offers all
 * three as editable boxes on that basis. Anything the caller leaves out falls
 * back to the rows exactly as before, so a client that posts bands alone is
 * unaffected — which is every client that existed before this.
 */
const resolveTotals = (data, existing = null) => {
  // A PATCH that changes the rows is asking for the totals to follow them.
  // One that says nothing about either keeps what is already filed — an
  // amendment to the truck count must not quietly undo a correction made to
  // the litres last week.
  const rowsChanged = stated(data.priceBands);
  const priceBands = rowsChanged ? data.priceBands : existing?.priceBands;
  const derived = deriveFromBands(
    priceBands,
    stated(data.litresSold) ? data.litresSold : existing?.litresSold,
    stated(data.avgPrice) ? data.avgPrice : existing?.avgPrice
  );

  const pick = (key) => {
    if (stated(data[key])) return Number(data[key]);
    if (existing && !rowsChanged && stated(existing[key])) return Number(existing[key]);
    return derived[key];
  };

  return {
    litresSold: pick("litresSold"),
    avgPrice: pick("avgPrice"),
    totalSalesAmount: pick("totalSalesAmount"),
  };
};

const submitReport = async (data, { actor }) => {
  const derived = resolveTotals(data);

  try {
    const report = await dailyReportRepo.create({
      ...data,
      litresSold: derived.litresSold.toFixed(2),
      avgPrice: derived.avgPrice.toFixed(2),
      totalSalesAmount: derived.totalSalesAmount.toFixed(2),
      status: "submitted",
      submittedBy: actor?.id || null,
      submittedByName: actor?.name || "",
    });

    emitEvent("daily_report.submitted", {
      actor,
      entityType: "daily_report",
      entityId: report.id,
      location: report.location,
      reportDate: report.reportDate,
      // For the notification consumer, so reviewers see who filed it.
      submittedBy: report.submittedBy || null,
      submittedByName: report.submittedByName || "",
    });

    return { success: true, report };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        duplicate: true,
        message: "You have already filed this report for that date, location and PFI",
      };
    }
    throw err;
  }
};

/**
 * Corrections while still under review: only the submitter's own submitted
 * (not yet reviewed) report can change, and derived fields are recomputed.
 */
const amendReport = async (id, data, { actor }) => {
  const report = await dailyReportRepo.findById(id);
  if (!report) return { success: false, notFound: true, message: "Report not found" };
  if (report.status !== "submitted") {
    return { success: false, message: `A ${report.status} report can no longer be amended` };
  }
  if (actor?.id && report.submittedBy && report.submittedBy !== actor.id) {
    return { success: false, forbidden: true, message: "Only the submitter can amend this report" };
  }

  // The amendment against what is already filed: a partial PATCH keeps every
  // figure it does not mention.
  const derived = resolveTotals(data, report);

  const updated = await dailyReportRepo.update(id, {
    ...data,
    litresSold: derived.litresSold.toFixed(2),
    avgPrice: derived.avgPrice.toFixed(2),
    totalSalesAmount: derived.totalSalesAmount.toFixed(2),
  });

  emitEvent("daily_report.amended", {
    actor,
    entityType: "daily_report",
    entityId: id,
  });

  return { success: true, report: updated };
};

const reviewReport = async (id, { approve, comment = "" }, { actor }) => {
  const report = await dailyReportRepo.findById(id);
  if (!report) return { success: false, notFound: true, message: "Report not found" };
  if (report.status !== "submitted") {
    return { success: false, message: `Report is already ${report.status}` };
  }
  // A manager cannot approve their own report.
  if (actor?.id && report.submittedBy === actor.id) {
    return { success: false, forbidden: true, message: "You cannot review your own report" };
  }

  const status = approve ? "approved" : "rejected";
  const updated = await dailyReportRepo.update(id, {
    status,
    reviewedBy: actor?.id || null,
    reviewedByName: actor?.name || "",
    reviewedAt: new Date(),
    reviewComment: comment,
  });

  const submitter = report.submittedBy ? await staffRepo.findById(report.submittedBy) : null;

  emitEvent(`daily_report.${status}`, {
    actor,
    entityType: "daily_report",
    entityId: id,
    report: updated,
    comment,
    submitterPhone: submitter?.phoneNumber || "",
    // The staff id, so the submitter gets an inbox row and a push rather than
    // only an SMS — a bare phone number can carry nothing else.
    submitterStaffId: submitter?.id || report.submittedBy || null,
  });

  return { success: true, report: updated };
};

module.exports = { submitReport, amendReport, reviewReport, deriveFromBands, resolveTotals };
