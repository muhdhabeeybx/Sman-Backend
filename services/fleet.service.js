const { fleetTruckRepo } = require("../repositories");
const { emitEvent } = require("./events");

// Fleet domain, same shape as the Django workflow: a truck registry
// ("fleet directory") and per-truck expense/income ledger entries. Entries
// are append-only — the repository exposes no update or delete — so the
// financial history can't be rewritten.

const createTruck = async (data, { actor }) => {
  const existing = await fleetTruckRepo.findByPlate(data.plateNumber);
  if (existing) {
    return { success: false, message: `A fleet truck with plate ${data.plateNumber} already exists` };
  }
  const truck = await fleetTruckRepo.create({ ...data, createdBy: actor?.id || null });

  emitEvent("fleet.truck_created", {
    actor,
    entityType: "fleet_truck",
    entityId: truck.id,
    plateNumber: truck.plateNumber,
  });

  return { success: true, truck };
};

const updateTruck = async (id, data, { actor }) => {
  const truck = await fleetTruckRepo.findById(id);
  if (!truck) return { success: false, notFound: true, message: "Fleet truck not found" };

  if (data.plateNumber && data.plateNumber !== truck.plateNumber) {
    const clash = await fleetTruckRepo.findByPlate(data.plateNumber);
    if (clash) {
      return { success: false, message: `A fleet truck with plate ${data.plateNumber} already exists` };
    }
  }

  const updated = await fleetTruckRepo.update(id, data);

  emitEvent("fleet.truck_updated", {
    actor,
    entityType: "fleet_truck",
    entityId: id,
    changedFields: Object.keys(data),
  });

  return { success: true, truck: updated };
};

const recordLedgerEntry = async (
  truckId,
  { entryType, category, amount, entryDate, description },
  { actor }
) => {
  const truck = await fleetTruckRepo.findById(truckId);
  if (!truck) return { success: false, notFound: true, message: "Fleet truck not found" };

  const entry = await fleetTruckRepo.createLedgerEntry({
    truckId,
    entryType,
    category,
    amount: Number(amount).toFixed(2),
    entryDate,
    description: description || "",
    enteredBy: actor?.name || "",
    recordedBy: actor?.id || null,
  });

  emitEvent("fleet.ledger_entry_added", {
    actor,
    entityType: "fleet_truck",
    entityId: truckId,
    plateNumber: truck.plateNumber,
    entryType,
    category,
    amount: entry.amount,
  });

  return { success: true, entry };
};


/**
 * One posting across many trucks — "July salaries", "Q3 insurance renewal".
 *
 * The cost of doing this a truck at a time is not typing, it is consistency:
 * twelve separate entries drift in wording and date, and the twelfth gets
 * forgotten. So the whole set is validated first and written in one insert —
 * an unknown truck id fails the batch rather than posting eleven of twelve
 * and leaving the operator to work out which one is missing.
 *
 * Each entry arrives fully resolved (its own description and amount), because
 * the screen shows the operator exactly those lines before they commit and
 * what they approved is what must be stored.
 */
const recordLedgerEntriesBatch = async (entries, { actor }) => {
  const trucks = await fleetTruckRepo.findByIds(entries.map((e) => e.truckId));
  const byId = new Map(trucks.map((t) => [t.id, t]));

  const missing = [...new Set(entries.map((e) => e.truckId).filter((id) => !byId.has(id)))];
  if (missing.length > 0) {
    return {
      success: false,
      notFound: true,
      message: `Unknown truck${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
    };
  }

  const created = await fleetTruckRepo.createLedgerEntries(
    entries.map((e) => ({
      truckId: e.truckId,
      entryType: e.entryType,
      category: e.category,
      amount: Number(e.amount).toFixed(2),
      entryDate: e.entryDate,
      description: e.description || "",
      enteredBy: actor?.name || "",
      recordedBy: actor?.id || null,
    }))
  );

  // One event for the batch, not one per line: a dozen near-identical rows
  // would bury the rest of the day's activity for no extra information.
  emitEvent("fleet.ledger_batch_added", {
    actor,
    entityType: "fleet_truck",
    entityId: created[0]?.truckId ?? null,
    entries: created.length,
    plateNumbers: entries.map((e) => byId.get(e.truckId)?.plateNumber).filter(Boolean),
    entryType: entries[0]?.entryType,
    category: entries[0]?.category,
    entryDate: entries[0]?.entryDate,
    total: created.reduce((sum, e) => sum + Number(e.amount || 0), 0).toFixed(2),
  });

  return { success: true, entries: created };
};

module.exports = { createTruck, updateTruck, recordLedgerEntry, recordLedgerEntriesBatch };
