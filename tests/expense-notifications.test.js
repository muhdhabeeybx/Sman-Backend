// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { db } = require("../config/db");
const { staff, notifications } = require("../db/schema");
const { eq, and, sql } = require("drizzle-orm");
const chain = require("../lib/expenseChain");
const { notifyExpenseStage } = require("../services/expenseNotifications.service");
const { closeDb } = require("./helpers");

const RUN = Date.now();

/**
 * notifyExpenseStage fires notify() without awaiting the dispatch (deliberately
 * — see the comment on notifyExpenseStage), and each recipient's own delivery
 * does two preference lookups before its inbox row lands, one recipient after
 * another — so the row count climbs over tens to a few hundred ms, not
 * instantly. Poll for the exact count the test expects rather than guessing a
 * "probably settled by now" delay, which either flakes under load or wastes
 * time when the real count is smaller than assumed.
 */
async function waitForRecipients(type, expenseId, expectedCount, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let rows = [];
  for (;;) {
    rows = await db
      .select({ staffId: notifications.staffId })
      .from(notifications)
      .where(and(eq(notifications.type, type), sql`${notifications.data}->>'expenseId' = ${String(expenseId)}`));
    if (rows.length >= expectedCount || Date.now() > deadline) {
      return rows.map((r) => r.staffId).sort((a, b) => a - b);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("expenseNotifications — the submitter hears about every stage, not just the ends", () => {
  let submitter;
  let officer;
  let cfo;
  let admin;

  before(async () => {
    const make = async (roles, tag) => {
      const [row] = await db
        .insert(staff)
        .values({
          firstName: "Notify",
          surname: tag,
          email: `notify-${tag.toLowerCase()}-${RUN}@soroman.test`,
          password: "TestPassw0rd!",
          isPasswordSet: true,
          roles,
          isActive: true,
        })
        .returning();
      return row;
    };

    // A submitter with no approval role of their own, distinct from every
    // stage's role-recipient, so "was the submitter included" is unambiguous.
    submitter = await make(["sales_manager"], "Submitter");
    officer = await make([chain.ROLE.OFFICER], "Officer");
    cfo = await make([chain.ROLE.CFO], "Cfo");
    admin = await make([chain.ROLE.ADMIN], "Admin");
  });

  after(async () => {
    await closeDb();
  });

  let nextId = 1;
  const baseExpense = () => ({
    id: RUN + nextId++,
    added_by: submitter.id,
    recorded_by: submitter.id,
    category_id: null,
    amount: "50000.00",
    description: "Test expense",
    vendor: "",
    payee_account_name: "",
    payee_bank_name: "",
    payee_account_number: "",
  });

  test("verified: CFO role + the submitter, not the officer who just verified it", async () => {
    const expense = baseExpense();
    await notifyExpenseStage({ expense, stage: chain.STATUS.VERIFIED, actorId: officer.id, actorName: "Officer" });

    const recipients = await waitForRecipients("expense.verified", expense.id, 2);
    assert.deepEqual(recipients, [cfo.id, submitter.id].sort((a, b) => a - b));
  });

  test("audit_approved: admin role + the submitter, not the CFO who just approved it", async () => {
    const expense = baseExpense();
    await notifyExpenseStage({ expense, stage: chain.STATUS.AUDIT_APPROVED, actorId: cfo.id, actorName: "Cfo" });

    const recipients = await waitForRecipients("expense.audit_approved", expense.id, 2);
    assert.deepEqual(recipients, [admin.id, submitter.id].sort((a, b) => a - b));
  });

  test("admin_approved: officer role + the submitter, not the admin who just gave final approval", async () => {
    const expense = baseExpense();
    await notifyExpenseStage({ expense, stage: chain.STATUS.ADMIN_APPROVED, actorId: admin.id, actorName: "Admin" });

    const recipients = await waitForRecipients("expense.admin_approved", expense.id, 2);
    assert.deepEqual(recipients, [officer.id, submitter.id].sort((a, b) => a - b));
  });

  test("a submitter who also holds the approving role is not double-notified, and is excluded when they are the actor", async () => {
    const expense = baseExpense();
    expense.added_by = cfo.id; // the CFO raised this one themselves

    // Someone else (the officer) verifies it — the CFO-submitter should
    // appear exactly once (as the role recipient), not twice.
    await notifyExpenseStage({ expense, stage: chain.STATUS.VERIFIED, actorId: officer.id, actorName: "Officer" });
    assert.deepEqual(await waitForRecipients("expense.verified", expense.id, 1), [cfo.id]);

    // The CFO-submitter approves their own request — the admin role recipient
    // still hears about it (someone always needs to give final sign-off);
    // only the submitter-specific entry drops out, since here that's the actor.
    const expense2 = baseExpense();
    expense2.added_by = cfo.id;
    await notifyExpenseStage({ expense: expense2, stage: chain.STATUS.AUDIT_APPROVED, actorId: cfo.id, actorName: "Cfo" });
    const recipients = await waitForRecipients("expense.audit_approved", expense2.id, 1);
    assert.deepEqual(recipients, [admin.id], "the role recipient still fires; only the actor-submitter is excluded");
  });

  test("pending and paid are unchanged: pending stays officer-only, paid still reaches every participant", async () => {
    const pendingExpense = baseExpense();
    await notifyExpenseStage({ expense: pendingExpense, stage: chain.STATUS.PENDING, actorId: submitter.id, actorName: "Submitter" });
    assert.deepEqual(await waitForRecipients("expense.pending", pendingExpense.id), [officer.id]);

    const paidExpense = baseExpense();
    paidExpense.verified_by = officer.id;
    paidExpense.audit_approved_by = cfo.id;
    paidExpense.admin_approved_by = admin.id;
    paidExpense.paid_by = officer.id;
    await notifyExpenseStage({ expense: paidExpense, stage: chain.STATUS.PAID, actorId: officer.id, actorName: "Officer" });
    const recipients = await waitForRecipients("expense.paid", paidExpense.id);
    assert.deepEqual(recipients, [submitter.id, cfo.id, admin.id].sort((a, b) => a - b));
  });
});
