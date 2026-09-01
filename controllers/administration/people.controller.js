const asyncHandler = require("express-async-handler");
const { peopleRepo, contactRepo, customerRepo } = require("../../repositories");
const { emitEvent } = require("../../services/events");
const peopleMerge = require("../../services/peopleMerge.service");

/**
 * A refusal from the merge service, as something the error handler honours.
 *
 * `res.status()` before a throw is not enough: errorHandler reads the status
 * off the ERROR (`err.status`), because by the time it runs the response has
 * not been sent and any status set on it is discarded. Setting it on the
 * response and throwing turned every one of these considered refusals — "keep
 * the customer, not the lead" — into a bare 500.
 */
const refusal = ({ status, message }) => {
  const err = new Error(message);
  err.status = status;
  return err;
};
const { staffActor } = require("../../utils/actor");

/**
 * People — customers and contacts as one book.
 *
 * The two tables stay separate (see migration 0005); the two PAGES did not
 * survive, because the same human was on both the moment a lead signed up.
 * repositories/people.repository.js explains the merge in full.
 */

/** GET /api/people — the merged, filterable list. */
const getPeople = asyncHandler(async (req, res) => {
  const {
    search, kind, converted, locationId, tag, optedOut, status,
    activity, hasBalance, numberStatus, duplicates, sort, page = 1, limit = 50,
  } = req.query;

  const result = await peopleRepo.findAll({
    search, kind, converted, locationId, tag, optedOut, status,
    activity, hasBalance, numberStatus, duplicates, sort, page, limit,
  });

  res.json({ success: true, data: result });
});

/**
 * GET /api/people/hygiene — the review panel.
 *
 * Read-only and deliberately so. Nothing here deletes anything: 8% of the
 * customer numbers on the live book are unusable, and a good share of those
 * rows carry orders and deposits. What to do about each is a judgement a
 * person makes, so this endpoint's job is to lay the evidence out — the
 * problem, every record holding the number, and whether each is even
 * removable — and then get out of the way.
 */
const getHygiene = asyncHandler(async (req, res) => {
  const result = await peopleRepo.findHygieneIssues({
    issue: req.query.issue || "all",
    limit: req.query.limit,
  });
  res.json({ success: true, data: result });
});

/**
 * POST /api/people/hygiene/delete — remove reviewed records.
 *
 * The guard is re-run here against live rows rather than trusted from the
 * payload. The panel was fetched at some point in the past and the client
 * could send anything; a customer who placed their first order in between
 * must not be deleted because the browser still believed they had none.
 *
 * Partial success is reported honestly — the removable rows go, the blocked
 * ones come back named with the reason, and the caller gets a 200 with both
 * lists rather than an all-or-nothing failure that tells them nothing about
 * which half was the problem.
 */
const deleteReviewed = asyncHandler(async (req, res) => {
  const records = req.body.records || [];
  const deleted = [];
  const blocked = [];

  for (const record of records) {
    if (record.kind === "contact") {
      // Nothing points at a contact row — no orders, no wallet, no ledger.
      const removed = await contactRepo.deleteById(Number(record.id));
      if (removed) deleted.push({ kind: "contact", id: removed.id, name: removed.name });
      else blocked.push({ kind: "contact", id: record.id, reason: "Already gone" });
      continue;
    }

    const guard = await peopleRepo.customerDeleteGuard(record.id);
    if (!guard.found) {
      blocked.push({ kind: "customer", id: record.id, reason: "Already gone" });
      continue;
    }
    if (guard.reason) {
      blocked.push({ kind: "customer", id: record.id, name: guard.name, reason: guard.reason });
      continue;
    }
    await customerRepo.deleteById(Number(record.id));
    deleted.push({ kind: "customer", id: Number(record.id), name: guard.name });
  }

  // The scan is memoised for a minute; deleting through it must not leave the
  // panel reporting rows that are no longer there.
  peopleRepo.invalidateHygieneCache();

  if (deleted.length) {
    emitEvent("people.records_deleted", {
      actor: staffActor(req),
      entityType: "people",
      entityId: "hygiene",
      deleted,
    });
  }

  const parts = [];
  if (deleted.length) parts.push(`${deleted.length} removed`);
  if (blocked.length) parts.push(`${blocked.length} kept`);

  res.json({
    success: true,
    message: parts.join(", ") || "Nothing to do",
    data: { deleted, blocked },
  });
});

/**
 * POST /api/people/merge/preview — what folding these records together does.
 *
 * A dry run, and the reason the merge screen can be honest: the desk is about
 * to move somebody's whole order history onto another row, and "are you sure?"
 * is not an answer to "what exactly is going to happen?". This returns the
 * counts, the wallet arithmetic, the numbers that come across and the things
 * worth knowing before the button is pressed — from the same code the merge
 * runs, so the two cannot tell different stories.
 *
 * Nothing is written, so it sits behind the ordinary staff gate.
 */
const previewMerge = asyncHandler(async (req, res) => {
  const result = await peopleMerge.previewMerge({
    target: req.body.target,
    sources: req.body.sources,
  });
  if (!result.ok) throw refusal(result);
  res.json({ success: true, data: result });
});

/**
 * POST /api/people/merge — fold the chosen records into one.
 *
 * Admin-gated for the same reason the hygiene delete is: customer rows go
 * away. What makes this the safer of the two is that nothing they were
 * carrying goes with them — every order, deposit and naira is re-pointed at
 * the survivor first, inside one transaction.
 */
const mergePeople = asyncHandler(async (req, res) => {
  const result = await peopleMerge.mergePeople({
    target: req.body.target,
    sources: req.body.sources,
    actorId: req.user?.id || null,
  });
  if (!result.ok) throw refusal(result);

  // The scan is memoised for a minute, and a merge changes which numbers are
  // duplicated — which is the whole reason somebody came here.
  peopleRepo.invalidateHygieneCache();

  emitEvent("people.records_merged", {
    actor: staffActor(req),
    entityType: "people",
    entityId: `${result.target.kind}:${result.target.id}`,
    target: result.target,
    sources: result.sources,
    moved: result.moved,
    balance: result.balance,
  });

  const merged = result.sources.length;
  const orders = result.moved.orders;
  const parts = [`${merged} record${merged === 1 ? "" : "s"} merged into ${result.target.name}`];
  if (orders) parts.push(`${orders} order${orders === 1 ? "" : "s"} moved across`);

  res.json({ success: true, message: parts.join(" — "), data: result });
});

module.exports = { getPeople, getHygiene, deleteReviewed, previewMerge, mergePeople };
