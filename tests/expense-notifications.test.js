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
 * instantly. Poll until every id the test cares about has shown up, rather
 * than an exact row count: this suite shares one local Postgres with every
 * other test file, so `finance`/`admin`/`expenditure_officer`-role staff from
 * unrelated fixtures can legitimately also be in the recipient list, and
 * asserting an exact set would make this test order-dependent.
 */
async function waitForRecipients(type, expenseId, mustInclude, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let ids = [];
  for (;;) {
    const rows = await db
      .select({ staffId: notifications.staffId })
      .from(notifications)
      .where(and(eq(notifications.type, type), sql`${notifications.data}->>'expenseId' = ${String(expenseId)}`));
    ids = rows.map((r) => r.staffId);
    const hasAll = mustInclude.every((id) => ids.includes(id));
    if (hasAll || Date.now() > deadline) return ids;
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

  /**
   * Take the fixture staff away again.
   *
   * They used to be left behind, and that quietly broke this file over time:
   * every run added four more staff, one of them holding the CFO role, so the
   * `verified` fan-out grew by one recipient per run — each costing two
   * preference lookups and an inbox insert. After a few dozen runs the local
   * test database held twenty finance-role staff and thirty thousand
   * notification rows, and the 3-second poll below started timing out. The
   * failure looked exactly like a broken notification path rather than what it
   * was, which is the expensive part.
   *
   * `notifications.staff_id` is ON DELETE CASCADE, so removing the staff takes
   * their inbox rows with them.
   */
  after(async () => {
    await db.delete(staff).where(sql`${staff.email} LIKE ${`notify-%-${RUN}@soroman.test`}`);
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

    const recipients = await waitForRecipients("expense.verified", expense.id, [cfo.id, submitter.id]);
    assert.ok(recipients.includes(cfo.id), "CFO role recipient");
    assert.ok(recipients.includes(submitter.id), "submitter now hears about the middle stages too");
    assert.ok(!recipients.includes(officer.id), "the officer who just acted is not notified of their own action");
  });

  test("audit_approved: admin role + the submitter, not the CFO who just approved it", async () => {
    const expense = baseExpense();
    await notifyExpenseStage({ expense, stage: chain.STATUS.AUDIT_APPROVED, actorId: cfo.id, actorName: "Cfo" });

    const recipients = await waitForRecipients("expense.audit_approved", expense.id, [admin.id, submitter.id]);
    assert.ok(recipients.includes(admin.id), "admin role recipient");
    assert.ok(recipients.includes(submitter.id));
    assert.ok(!recipients.includes(cfo.id), "the CFO who just acted is not notified of their own action");
  });

  test("admin_approved: officer role + the submitter, not the admin who just gave final approval", async () => {
    const expense = baseExpense();
    await notifyExpenseStage({ expense, stage: chain.STATUS.ADMIN_APPROVED, actorId: admin.id, actorName: "Admin" });

    const recipients = await waitForRecipients("expense.admin_approved", expense.id, [officer.id, submitter.id]);
    assert.ok(recipients.includes(officer.id), "officer role recipient (they will make the payment)");
    assert.ok(recipients.includes(submitter.id));
    assert.ok(!recipients.includes(admin.id), "the admin who just acted is not notified of their own action");
  });

  test("a submitter who also holds the approving role is not double-notified, and is excluded when they are the actor", async () => {
    const expense = baseExpense();
    expense.added_by = cfo.id; // the CFO raised this one themselves

    // Someone else (the officer) verifies it — the CFO-submitter must appear
    // exactly once (as the role recipient), not twice, in their own entry.
    await notifyExpenseStage({ expense, stage: chain.STATUS.VERIFIED, actorId: officer.id, actorName: "Officer" });
    const recipients1 = await waitForRecipients("expense.verified", expense.id, [cfo.id]);
    assert.equal(recipients1.filter((id) => id === cfo.id).length, 1, "CFO appears once, not twice");

    // The CFO-submitter approves their own request — the admin role recipient
    // still hears about it (someone always needs to give final sign-off);
    // only the submitter-specific entry drops out, since here that's the actor.
    const expense2 = baseExpense();
    expense2.added_by = cfo.id;
    await notifyExpenseStage({ expense: expense2, stage: chain.STATUS.AUDIT_APPROVED, actorId: cfo.id, actorName: "Cfo" });
    const recipients2 = await waitForRecipients("expense.audit_approved", expense2.id, [admin.id]);
    assert.ok(recipients2.includes(admin.id), "the role recipient still fires");
    assert.ok(!recipients2.includes(cfo.id), "the actor-submitter is excluded, even as the role holder");
  });

  test("pending and paid are unchanged: pending stays officer-only, paid still reaches every participant", async () => {
    const pendingExpense = baseExpense();
    await notifyExpenseStage({ expense: pendingExpense, stage: chain.STATUS.PENDING, actorId: submitter.id, actorName: "Submitter" });
    const pendingRecipients = await waitForRecipients("expense.pending", pendingExpense.id, [officer.id]);
    assert.ok(pendingRecipients.includes(officer.id));
    assert.ok(!pendingRecipients.includes(submitter.id), "pending doesn't add the submitter — they are the one who just acted");

    const paidExpense = baseExpense();
    paidExpense.verified_by = officer.id;
    paidExpense.audit_approved_by = cfo.id;
    paidExpense.admin_approved_by = admin.id;
    paidExpense.paid_by = officer.id;
    await notifyExpenseStage({ expense: paidExpense, stage: chain.STATUS.PAID, actorId: officer.id, actorName: "Officer" });
    const paidRecipients = await waitForRecipients("expense.paid", paidExpense.id, [submitter.id, cfo.id, admin.id]);
    assert.ok(paidRecipients.includes(submitter.id));
    assert.ok(paidRecipients.includes(cfo.id));
    assert.ok(paidRecipients.includes(admin.id));
    assert.ok(!paidRecipients.includes(officer.id), "the officer who marked it paid is not notified of their own action");
  });
});
