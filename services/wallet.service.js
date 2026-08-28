const { eq, and, sql, asc, gt, inArray } = require("drizzle-orm");
const { db } = require("../config/db");
const {
  customers, deposits, walletHolds, orderDepositAllocations, bankStatementLines, orders,
} = require("../db/schema");
const customerRepo = require("../repositories/customer.repository");
const bankAccountRepo = require("../repositories/bankAccount.repository");

// Every operation here runs inside a single database transaction, and every
// balance change goes through customerRepo.creditBalance/debitBalance — an
// atomically guarded UPDATE (`WHERE balance >= amount` on the debit side), not
// a separate read-then-write. Two concurrent debits racing the same balance
// cannot both pass: the database itself serializes the two UPDATEs, and the
// second one's guard simply fails to match. Nothing outside this file should
// write customers.balance or insert deposits rows for wallet money movements
// — every business debit/credit must land its ledger row in the same
// transaction as the balance change, and this is the one place that does both.
//
// The invariant these operations maintain:
//
//   customers.balance = sum(credit deposits) - sum(debit deposits)
//                       - sum(active holds)
//
// getLedgerBalance() recomputes the right-hand side for reconciliation.

const UNIQUE_VIOLATION = "23505";

// Drizzle wraps driver errors; the Postgres error code is on the cause.
const isUniqueViolation = (err) =>
  err?.code === UNIQUE_VIOLATION || err?.cause?.code === UNIQUE_VIOLATION;

const money = (value) => Number(value || 0);
const asDecimal = (value) => money(value).toFixed(2);

/**
 * Credit the wallet. Idempotent when a `reference` is supplied: a second call
 * with the same reference returns the original deposit row untouched.
 *
 * `trackDeposit` also bumps the customers.deposit / previousDeposit counters —
 * true for genuine money-in (bank transfer, manual deposit), false for
 * refunds, which are returned money rather than new deposits.
 *
 * An optional `tx` lets a caller (e.g. a bulk statement-line deposit) commit
 * the credit atomically with other writes in its own transaction — same
 * pattern as placeHold. Without one, the credit gets its own transaction.
 */
const credit = async (
  {
    customerId,
    amount,
    description = "",
    reference = "",
    paystackDetails = null,
    recordedBy = null,
    trackDeposit = true,
    /**
     * The value date from the bank statement, where one backs this credit.
     *
     * Left null for money that never came off a statement — an internal
     * wallet transfer, an overpayment carried across — because those have no
     * banking date, and defaulting it to "now" is precisely the confusion
     * migration 0017 exists to end.
     */
    depositDate = null,
  },
  tx,
) => {
  const value = money(amount);
  if (value <= 0) {
    return { success: false, message: "Credit amount must be positive" };
  }

  const run = async (trx) => {
    if (reference) {
      const [existing] = await trx
        .select()
        .from(deposits)
        .where(eq(deposits.reference, reference))
        .limit(1);
      if (existing) {
        return {
          success: true,
          alreadyProcessed: true,
          deposit: existing,
          message: `Transaction reference ${reference} has already been recorded.`,
        };
      }
    }

    // Credits can never overdraw, so the guarded UPDATE only needs to
    // match on id; it returns null solely when the customer doesn't exist.
    let updated = await customerRepo.creditBalance(customerId, value, trx);
    if (!updated) {
      return { success: false, message: "Customer not found" };
    }

    if (trackDeposit) {
      // previousDeposit is the counter as of right after the balance-only
      // update above — deposit/previousDeposit are untouched by
      // creditBalance, so this is exactly "before this credit's deposit
      // counter changed", computed inside the same transaction rather than
      // from a separate earlier read.
      const [withDeposit] = await trx
        .update(customers)
        .set({
          previousDeposit: updated.deposit,
          deposit: sql`${customers.deposit} + ${value}`,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customerId))
        .returning();
      updated = withDeposit;
    }

    const [deposit] = await trx
      .insert(deposits)
      .values({
        customerId,
        amount: asDecimal(value),
        type: "credit",
        description,
        reference,
        recordedBy,
        balanceAfter: asDecimal(updated.balance),
        paystackDetails,
        depositDate: depositDate || null,
        // Starts fully unclaimed; allocateOrderFunding() draws it down as
        // orders are paid from it.
        remainingAmount: asDecimal(value),
      })
      .returning();

    return { success: true, deposit, customer: updated };
  };

  // Inside a caller's transaction a duplicate-reference violation must
  // propagate — the caller's atomic unit can't be soft-recovered here
  // (Postgres aborts it). The soft-recovery path below only applies to the
  // standalone transaction case.
  if (tx) return run(tx);
  try {
    return await db.transaction(run);
  } catch (err) {
    // Two requests raced past the pre-check with the same reference; the
    // partial unique index on deposits.reference stopped the second one.
    if (isUniqueViolation(err) && reference) {
      const [existing] = await db
        .select()
        .from(deposits)
        .where(eq(deposits.reference, reference))
        .limit(1);
      return {
        success: true,
        alreadyProcessed: true,
        deposit: existing || null,
        message: `Transaction reference ${reference} has already been recorded.`,
      };
    }
    throw err;
  }
};

/**
 * A manual deposit sourced from one or more bank-statement lines: claim the
 * lines and credit the wallet once per line — each keeps its own amount,
 * depositor, date and reference rather than being folded into a single
 * summed row, so the ledger mirrors the bank statement one row at a time.
 * All of it commits in one transaction.
 *
 * The claim is a guarded UPDATE (`WHERE status = 'UNMATCHED'`), so two staff
 * racing to use an overlapping set of lines can't both win — whoever loses
 * gets back fewer claimed rows than they asked for and the whole transaction
 * is rolled back rather than under-crediting silently.
 *
 * Amounts are never trusted from the client — each deposit's amount comes
 * from the claimed line itself.
 */
const creditFromStatementLines = async ({ customerId, bankAccountId, lineIds, staffId, description, orderId = null }) => {
  if (!Array.isArray(lineIds) || !lineIds.length) {
    return { success: false, message: "No statement lines were selected" };
  }

  // Only bankAccountId (the FK) was ever stored on the deposit before —
  // never the account's own name/number, which is why "paid into" read
  // blank everywhere downstream (the finance report, this deposit's own
  // detail view) despite the account being right there in the claim query.
  // Looked up once, outside the per-line loop below.
  const bankAccount = await bankAccountRepo.findById(bankAccountId);

  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(bankStatementLines)
      .set({
        status: "MATCHED",
        matchedBy: staffId ?? null,
        matchedAt: new Date(),
        // Stamped here rather than left to FIFO to work out later — this
        // line is being claimed FOR this order, right now, not just added
        // to the wallet in general.
        ...(orderId ? { matchedOrderId: orderId } : {}),
      })
      .where(
        and(
          inArray(bankStatementLines.id, lineIds),
          eq(bankStatementLines.bankAccountId, bankAccountId),
          eq(bankStatementLines.status, "UNMATCHED"),
        ),
      )
      .returning();

    // Returning a failure object here (instead of throwing) would still let
    // Drizzle commit the transaction — silently leaving whichever lines DID
    // get claimed stuck in MATCHED with no deposit behind them. Throwing is
    // what actually rolls the partial claim back.
    if (claimed.length !== lineIds.length) {
      throw Object.assign(
        new Error("One or more of those lines were already used in another deposit — refresh and try again."),
        { status: 409 },
      );
    }

    const createdDeposits = [];
    for (const line of claimed) {
      const creditResult = await credit(
        {
          customerId,
          amount: money(line.amount),
          description:
            description ||
            `Manual deposit — bank statement line${line.narration ? `: ${line.narration}` : ` #${line.id}`}`,
          // The line's own bank reference, if it has one — falling back to a
          // synthetic key that's stable per line (so retrying a failed
          // request is idempotent) rather than per request.
          reference: line.bankRef || `STMT-${line.id}`,
          // The banking date, stored ON the deposit rather than rediscovered
          // at read time by joining back to the statement line. That join took
          // the lowest-id line of however many funded the deposit, and fell
          // back to created_at when it found none — so a column headed
          // "Deposit Date" could quietly show the day the row was keyed in.
          // See migration 0017.
          depositDate: line.txnDate,
          paystackDetails: {
            paymentMethod: "manual_bank_transfer",
            channel: "manual_bank_transfer",
            bankAccountId,
            bankName: bankAccount?.bankName || null,
            accountName: bankAccount?.accountName || null,
            accountNumber: bankAccount?.accountNumber || null,
            senderName: line.depositor || null,
            paidAt: line.txnDate,
            statementLineIds: [line.id],
            statementLineCount: 1,
            ...(orderId ? { orderId } : {}),
          },
          recordedBy: staffId ?? null,
        },
        tx,
      );

      // Same reasoning as the claim check above: a credit failure, or a
      // reference that unexpectedly already belonged to some other deposit,
      // must abort the whole transaction rather than leave this line
      // claimed with no (or the wrong) deposit behind it.
      if (!creditResult.success || creditResult.alreadyProcessed) {
        throw Object.assign(
          new Error(
            creditResult.alreadyProcessed
              ? `Statement line ${line.id}'s reference was already used by another deposit — refresh and try again.`
              : creditResult.message || "Credit failed",
          ),
          { status: creditResult.alreadyProcessed ? 409 : 400 },
        );
      }

      await tx
        .update(bankStatementLines)
        .set({ matchedDepositId: creditResult.deposit.id })
        .where(eq(bankStatementLines.id, line.id));

      createdDeposits.push(creditResult.deposit);
    }

    const total = claimed.reduce((sum, l) => sum + money(l.amount), 0);
    return { success: true, deposits: createdDeposits, claimedLines: claimed, totalAmount: total };
  });
};

/**
 * Debit the wallet directly (no hold involved). Fails rather than allowing
 * the balance to go negative — debitBalance's guard is in the WHERE clause
 * of the UPDATE itself, not in a preceding read, so it cannot be raced.
 *
 * An optional `tx` lets a caller (e.g. transfer(), below) commit the debit
 * atomically with other writes in its own transaction — same pattern as
 * credit()/placeHold(). Without one, the debit gets its own transaction.
 */
const debit = async (
  { customerId, amount, description = "", reference = "", recordedBy = null },
  tx,
) => {
  const value = money(amount);
  if (value <= 0) {
    return { success: false, message: "Debit amount must be positive" };
  }

  const run = async (trx) => {
    const updated = await customerRepo.debitBalance(customerId, value, trx);
    if (!updated) {
      // Same guarded result whether the customer doesn't exist or simply
      // doesn't have enough — either way, this debit does not happen.
      return { success: false, insufficient: true, message: "Insufficient wallet balance" };
    }

    const [deposit] = await trx
      .insert(deposits)
      .values({
        customerId,
        amount: asDecimal(value),
        type: "debit",
        description,
        reference,
        recordedBy,
        balanceAfter: asDecimal(updated.balance),
      })
      .returning();

    return { success: true, deposit, customer: updated };
  };

  if (tx) return run(tx);
  return db.transaction(run);
};

/**
 * Move balance from one customer's wallet to another — e.g. a deposit was
 * recorded against the wrong customer, or a genuine account-to-account
 * transfer. One atomic debit + credit, same transaction. The credit leg
 * isn't `trackDeposit`: it's money moving inside the wallet system, not new
 * money coming into the business, the same distinction refunds already draw.
 */
const transfer = async ({ fromCustomerId, toCustomerId, amount, description = "", recordedBy = null }) => {
  const value = money(amount);
  if (value <= 0) {
    return { success: false, message: "Transfer amount must be positive" };
  }
  if (String(fromCustomerId) === String(toCustomerId)) {
    return { success: false, message: "Cannot transfer a balance to the same customer" };
  }

  return db.transaction(async (tx) => {
    const debitResult = await debit(
      {
        customerId: fromCustomerId,
        amount: value,
        description: description || `Wallet transfer to customer #${toCustomerId}`,
        recordedBy,
      },
      tx,
    );
    if (!debitResult.success) return debitResult;

    const creditResult = await credit(
      {
        customerId: toCustomerId,
        amount: value,
        description: description || `Wallet transfer from customer #${fromCustomerId}`,
        trackDeposit: false,
        recordedBy,
      },
      tx,
    );
    // credit() only returns success:false when the target customer doesn't
    // exist — that has to abort the whole transaction (including the debit
    // above), not just report a failure the caller might not roll back on.
    if (!creditResult.success) {
      throw Object.assign(new Error(creditResult.message || "Transfer failed"), { status: 400 });
    }

    return {
      success: true,
      debit: debitResult.deposit,
      credit: creditResult.deposit,
      fromCustomer: debitResult.customer,
      toCustomer: creditResult.customer,
    };
  });
};

/**
 * Reverse a credit deposit — e.g. a manual deposit recorded against the
 * wrong customer. Debits the same amount back out under the same guard every
 * debit uses, so a deposit already partly spent (its `remainingAmount` drawn
 * down by orders) can still fail to reverse if the customer's *current*
 * balance can't cover it — that's surfaced, not hidden, and it means the
 * reversal would otherwise be clawed back from unrelated funds rather than
 * "undoing" money that has already left as a completed order.
 *
 * There is no dedicated schema column linking a reversal back to the
 * original deposit — the reversal's own `reference`/`description` carry that
 * trail instead, the same convention statement-line deposits already use.
 */
const reverseDeposit = async ({ depositId, recordedBy = null, description = "" }, tx) => {
  const run = async (trx) => {
    const [original] = await trx
      .select()
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .for("update")
      .limit(1);

    if (!original) return { success: false, message: "Deposit not found" };
    if (original.type !== "credit") {
      return { success: false, message: "Only a credit deposit can be reversed" };
    }
    if (String(original.reference || "").startsWith("REV-")) {
      return { success: false, message: "This is itself a reversal — nothing to reverse" };
    }

    const value = money(original.amount);
    const updated = await customerRepo.debitBalance(original.customerId, value, trx);
    if (!updated) {
      return {
        success: false,
        insufficient: true,
        message: "The customer's current balance can't cover reversing this deposit — some of it may already be spent on orders.",
      };
    }

    const [reversal] = await trx
      .insert(deposits)
      .values({
        customerId: original.customerId,
        amount: asDecimal(value),
        type: "debit",
        description: description || `Reversal of deposit #${original.id}${original.reference ? ` (${original.reference})` : ""}`,
        reference: `REV-${original.id}`,
        recordedBy,
        balanceAfter: asDecimal(updated.balance),
      })
      .returning();

    // Cuts the original off as a funding source for any *future* order —
    // past allocations (order_deposit_allocations rows already written) stay
    // exactly as they were, since those orders genuinely were funded from it
    // at the time.
    await trx
      .update(deposits)
      .set({ remainingAmount: "0.00" })
      .where(eq(deposits.id, original.id));

    return { success: true, deposit: reversal, original, customer: updated };
  };
  return tx ? run(tx) : db.transaction(run);
};

/**
 * Move an order's payment hold to a different customer — the order was
 * placed against the wrong one and is already paid.
 *
 * This is NOT release-then-placeHold: wallet_holds carries one row per
 * order id, ever (unique on order_id, never re-used even once released), so
 * a fresh placeHold() for the same order collides with the old row. Instead
 * the existing row is repointed in place, under the same debit-the-new/
 * credit-the-old shape transfer() uses.
 *
 * The funding trail (order_deposit_allocations, which of the OLD customer's
 * deposits paid for it) is left exactly as it was — reassigning the order
 * going forward does not rewrite which cash historically funded it, the same
 * choice reverseDeposit() makes about remainingAmount.
 */
const reassignHold = async ({ orderId, toCustomerId }, tx) => {
  const run = async (trx) => {
    const [hold] = await trx
      .select()
      .from(walletHolds)
      .where(eq(walletHolds.orderId, orderId))
      .for("update")
      .limit(1);

    if (!hold) return { success: true, hold: null };
    if (hold.status !== "active") {
      return {
        success: false,
        message: "This order's payment has already been settled and its hold can no longer be reassigned",
      };
    }
    if (String(hold.customerId) === String(toCustomerId)) {
      return { success: true, hold };
    }

    const value = money(hold.amount);
    const updatedTo = await customerRepo.debitBalance(toCustomerId, value, trx);
    if (!updatedTo) {
      return {
        success: false,
        insufficient: true,
        message: "The destination customer doesn't have enough wallet balance to take over this order's hold",
      };
    }
    const updatedFrom = await customerRepo.creditBalance(hold.customerId, value, trx);

    const [movedHold] = await trx
      .update(walletHolds)
      .set({ customerId: toCustomerId })
      .where(eq(walletHolds.id, hold.id))
      .returning();

    return { success: true, hold: movedHold, fromCustomer: updatedFrom, toCustomer: updatedTo };
  };
  return tx ? run(tx) : db.transaction(run);
};

/**
 * How money reached an order. Recorded per allocation row so the report never
 * has to guess again — see db/migrations/0011.
 *
 *   BANK    a bank statement line matched to THIS order at confirm time
 *   WALLET  a draw from balance already sitting in the wallet
 *   LEGACY  written before any of this was recorded; unverifiable by design
 */
const ALLOCATION_SOURCE = { BANK: "bank", WALLET: "wallet", LEGACY: "legacy" };

/**
 * The deposits that were matched to THIS order, in the act of confirming it.
 *
 * Two records say so, and both are written at confirm time by
 * creditFromStatementLines()/rematchOrderFunding():
 *
 *   bank_statement_lines.matched_order_id  the line was claimed FOR this order
 *   deposits.paystack_details->>'orderId'  the deposit was recorded to confirm it
 *
 * The statement line is the stronger of the two — it is the row an auditor
 * will be holding — but a deposit typed in by hand has no line at all, so
 * both are consulted. Ordered oldest first so several tranches paid against
 * one order read in the order the bank lists them.
 */
const findDepositsMatchedToOrder = async (customerId, orderId, tx) => {
  const result = await tx.execute(sql`
    SELECT d.id, d.amount, d.remaining_amount AS "remainingAmount"
    FROM deposits d
    WHERE d.customer_id = ${customerId}
      AND d.type = 'credit'
      AND (
        EXISTS (
          SELECT 1 FROM bank_statement_lines l
          WHERE l.matched_deposit_id = d.id AND l.matched_order_id = ${orderId}
        )
        -- Guarded rather than cast outright: paystack_details is free-form
        -- JSON going back to the gateway era, and one non-numeric orderId
        -- anywhere in the table would abort the cast for every row.
        OR (d.paystack_details->>'orderId' ~ '^[0-9]+$'
            AND (d.paystack_details->>'orderId')::int = ${orderId})
      )
      -- Already written up against this order by an earlier attempt; a
      -- retried hold must not allocate the same credit twice.
      AND NOT EXISTS (
        SELECT 1 FROM order_deposit_allocations a
        WHERE a.deposit_id = d.id AND a.order_id = ${orderId}
      )
    ORDER BY d.created_at ASC, d.id ASC
    FOR UPDATE OF d
  `);
  return result.rows ?? result;
};

/**
 * Write up where an order's payment came from.
 *
 * Two passes, and the order of them is the whole point:
 *
 *   1. The statement lines that were matched to this order. Each is recorded
 *      at its FACE value, because that is the figure on the bank statement
 *      this report gets checked against. What the order consumes of it is
 *      capped at the order's own value; any surplus stays in the wallet with
 *      its reference still attached, so a later manual draw can name where
 *      the balance came from.
 *
 *   2. Only whatever the order still needs after that, drawn from the rest of
 *      the wallet oldest-credit-first, and marked as a wallet draw.
 *
 * Pass 1 did not exist. Everything went through pass 2, which meant an order
 * confirmed against a specific bank credit was written up as slices of
 * whatever unclaimed money happened to be oldest — reading, on the report, as
 * a pile of small "transfers" from unrelated payers. The evidence for pass 1
 * was being recorded all along (matched_order_id), just never read.
 *
 * Purely additive bookkeeping: called from placeHold()/releaseHold() wrapped
 * in try/catch that only logs. A bug here must never be able to fail or roll
 * back an actual payment — the balance debit above this call is the real
 * money movement and already happened by the time this runs. Any remainder
 * left unallocated came from deposits that predate this ledger
 * (remainingAmount IS NULL, so the `gt` filter below excludes them) — that's
 * expected, not an error, and the finance report surfaces it as "not tracked."
 */
const allocateOrderFunding = async (customerId, orderId, amount, tx) => {
  let remaining = money(amount);
  if (remaining <= 0) return;

  /** Record one row and draw the deposit down by what the order consumed. */
  const write = async (depositId, received, applied, source) => {
    if (applied > 0) {
      await tx
        .update(deposits)
        .set({ remainingAmount: sql`${deposits.remainingAmount} - ${asDecimal(applied)}` })
        .where(eq(deposits.id, depositId));
    }
    await tx.insert(orderDepositAllocations).values({
      orderId,
      depositId,
      amount: asDecimal(received),
      appliedAmount: asDecimal(applied),
      source,
    });
  };

  // ── 1. What was actually matched to this order ──────────────────────────
  const matched = await findDepositsMatchedToOrder(customerId, orderId, tx);
  for (const d of matched) {
    // Face value of the credit, whether or not this order needed all of it.
    const received = money(d.amount);
    if (received <= 0) continue;
    // What it can still spend, against what the order still needs. A credit
    // already partly spent elsewhere can only apply what is left of it.
    const applied = Math.min(money(d.remainingAmount), remaining);
    await write(d.id, received, Math.max(0, applied), ALLOCATION_SOURCE.BANK);
    remaining -= Math.max(0, applied);
  }

  if (remaining <= 0) return;

  // ── 2. The rest, from balance already in the wallet ─────────────────────
  const matchedIds = new Set(matched.map((d) => Number(d.id)));
  const candidates = await tx
    .select({ id: deposits.id, remainingAmount: deposits.remainingAmount })
    .from(deposits)
    .where(and(eq(deposits.customerId, customerId), eq(deposits.type, "credit"), gt(deposits.remainingAmount, 0)))
    .orderBy(asc(deposits.createdAt))
    .for("update");

  for (const d of candidates) {
    if (remaining <= 0) break;
    // Pass 1 already wrote a row for these, and the unique index on
    // (order_id, deposit_id) would reject a second one anyway.
    if (matchedIds.has(Number(d.id))) continue;
    const take = Math.min(money(d.remainingAmount), remaining);
    if (take <= 0) continue;

    await write(d.id, take, take, ALLOCATION_SOURCE.WALLET);
    remaining -= take;
  }
};

/**
 * Undo a statement match outright: take the deposit back out of the wallet,
 * drop whatever order it was attributed to, and return its line to the
 * unmatched pool so it can be matched where it belongs.
 *
 * Unlike rematchOrderFunding this removes money rather than swapping it, so
 * it only works while that money is still free. If the deposit is what paid
 * a live order, reversing it would take the balance below what that order's
 * hold has committed — the guard in reverseDeposit refuses, and the caller
 * is told to re-match instead, which brings a replacement with it.
 *
 * The deposit row is not deleted. It is reversed, leaving both it and its
 * mirror debit on the ledger — a wallet's history is a record of what
 * happened, including the corrections.
 */
const unmatchStatementDeposit = async ({ depositId, staffId = null, description = "" }, tx) => {
  const run = async (trx) => {
    const [deposit] = await trx
      .select()
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .for("update")
      .limit(1);
    if (!deposit) return { success: false, message: "Deposit not found" };
    if (deposit.type !== "credit") {
      return { success: false, message: "Only a credit deposit can be unmatched" };
    }

    // Which orders were pointing at it, so the caller can be told what was
    // detached rather than discovering it on the report afterwards.
    const attached = await trx
      .select({ orderId: orderDepositAllocations.orderId, amount: orderDepositAllocations.amount })
      .from(orderDepositAllocations)
      .where(eq(orderDepositAllocations.depositId, depositId));

    await trx.delete(orderDepositAllocations).where(eq(orderDepositAllocations.depositId, depositId));

    const res = await reverseDeposit(
      {
        depositId,
        recordedBy: staffId,
        description: description || `Unmatched — this payment was not for ${attached.length ? `order #${attached[0].orderId}` : "this customer"}`,
      },
      trx,
    );
    if (!res.success) {
      return {
        success: false,
        insufficient: res.insufficient,
        message: res.insufficient
          ? "This payment is what funded a live order, so it cannot simply be removed — the money is already committed. Use Re-match on that order to swap in the correct statement line instead."
          : res.message || "Could not unmatch this payment",
      };
    }

    const freed = await trx
      .update(bankStatementLines)
      .set({ status: "UNMATCHED", matchedDepositId: null, matchedOrderId: null, matchedBy: null, matchedAt: null })
      .where(eq(bankStatementLines.matchedDepositId, depositId))
      .returning();

    return {
      success: true,
      reversal: res.deposit,
      detachedFrom: attached.map((a) => a.orderId),
      freedLineIds: freed.map((l) => l.id),
    };
  };
  return tx ? run(tx) : db.transaction(run);
};

/**
 * Point an order at the statement line(s) that actually paid for it.
 *
 * The situation this exists for: the wrong line was matched, the order is
 * already paid, and there was no way back — a MATCHED line could never be
 * released, so the mistake was permanent and the finance report named the
 * wrong payment for that order forever.
 *
 * Order of operations matters and is not arbitrary. The replacement is
 * credited BEFORE the mistake is reversed, so the reversal's
 * balance-can't-go-negative guard has the new money to work against. Done the
 * other way round it would fail on every order whose funds are already
 * committed to a hold — which is every order this is for.
 *
 * The hold itself is never touched. The customer still owes the same money
 * and the order is still paid; only which deposit is recorded as having paid
 * it changes, plus the balance moving by (new − old) where the two differ.
 *
 * Old deposits that came from a statement line have that line returned to the
 * unmatched pool, so it can be matched to the order it really belongs to.
 */
const rematchOrderFunding = async (
  { orderId, bankAccountId, lineIds, staffId = null, description = "" },
  tx,
) => {
  const run = async (trx) => {
    const [order] = await trx
      .select({ customerId: orders.customerId, totalAmount: orders.totalAmount })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) return { success: false, message: "Order not found" };

    // The hold is the authority on what was actually taken, but orders paid
    // before holds existed have allocations and no hold row — those are
    // exactly the old mis-matches most in need of correcting, so the order's
    // own total stands in rather than turning them away.
    const [hold] = await trx
      .select()
      .from(walletHolds)
      .where(eq(walletHolds.orderId, orderId))
      .for("update")
      .limit(1);

    const customerId = hold ? hold.customerId : order.customerId;
    const holdAmount = hold ? money(hold.amount) : money(order.totalAmount);

    // What is on the order now, and which deposits those were. The applied
    // figure is the one to give back — see deallocateOrderFunding.
    const current = await trx
      .select({
        depositId: orderDepositAllocations.depositId,
        appliedAmount: orderDepositAllocations.appliedAmount,
      })
      .from(orderDepositAllocations)
      .where(eq(orderDepositAllocations.orderId, orderId));

    // --- 1. Claim the replacement lines and credit them -------------------
    const claimed = await trx
      .update(bankStatementLines)
      .set({
        status: "MATCHED",
        matchedBy: staffId,
        matchedAt: new Date(),
        matchedOrderId: orderId,
      })
      .where(
        and(
          inArray(bankStatementLines.id, lineIds),
          eq(bankStatementLines.bankAccountId, bankAccountId),
          eq(bankStatementLines.status, "UNMATCHED"),
        ),
      )
      .returning();

    if (claimed.length !== lineIds.length) {
      throw Object.assign(
        new Error("One or more of those lines were already used in another deposit — refresh and try again."),
        { status: 409 },
      );
    }

    const bankAccount = await bankAccountRepo.findById(bankAccountId);
    const newDeposits = [];
    for (const line of claimed) {
      const res = await credit(
        {
          customerId,
          amount: money(line.amount),
          description:
            description || `Re-matched payment for order #${orderId}${line.narration ? `: ${line.narration}` : ""}`,
          reference: line.bankRef || `STMT-${line.id}`,
          // The banking date, stored ON the deposit rather than rediscovered
          // at read time by joining back to the statement line. That join took
          // the lowest-id line of however many funded the deposit, and fell
          // back to created_at when it found none — so a column headed
          // "Deposit Date" could quietly show the day the row was keyed in.
          // See migration 0017.
          depositDate: line.txnDate,
          paystackDetails: {
            paymentMethod: "manual_bank_transfer",
            channel: "manual_bank_transfer",
            bankAccountId,
            bankName: bankAccount?.bankName || null,
            accountName: bankAccount?.accountName || null,
            accountNumber: bankAccount?.accountNumber || null,
            senderName: line.depositor || null,
            paidAt: line.txnDate,
            statementLineIds: [line.id],
            statementLineCount: 1,
            orderId,
          },
          recordedBy: staffId,
        },
        trx,
      );
      if (!res.success || res.alreadyProcessed) {
        throw Object.assign(
          new Error(
            res.alreadyProcessed
              ? `Statement line ${line.id}'s reference was already used by another deposit — refresh and try again.`
              : res.message || "Credit failed",
          ),
          { status: res.alreadyProcessed ? 409 : 400 },
        );
      }
      await trx
        .update(bankStatementLines)
        .set({ matchedDepositId: res.deposit.id })
        .where(eq(bankStatementLines.id, line.id));
      newDeposits.push(res.deposit);
    }
    const newTotal = claimed.reduce((sum, l) => sum + money(l.amount), 0);

    // --- 2. Take the order off its old sources ----------------------------
    for (const r of current) {
      await trx
        .update(deposits)
        .set({ remainingAmount: sql`${deposits.remainingAmount} + ${r.appliedAmount}` })
        .where(eq(deposits.id, r.depositId));
    }
    await trx.delete(orderDepositAllocations).where(eq(orderDepositAllocations.orderId, orderId));

    // --- 3. Put it on the new ones ----------------------------------------
    // Each replacement line is recorded at face value — it is a bank row, and
    // a bank row is the statement line as the statement has it. Only what the
    // order consumes is taken out of the credit, so picking a line larger
    // than the order leaves the surplus in the wallet under its own reference
    // rather than silently trimming the figure the auditor will look for.
    let remaining = holdAmount;
    for (const d of newDeposits) {
      const received = money(d.amount);
      if (received <= 0) continue;
      const applied = Math.max(0, Math.min(received, remaining));
      if (applied > 0) {
        await trx
          .update(deposits)
          .set({ remainingAmount: sql`${deposits.remainingAmount} - ${asDecimal(applied)}` })
          .where(eq(deposits.id, d.id));
      }
      await trx.insert(orderDepositAllocations).values({
        orderId,
        depositId: d.id,
        amount: asDecimal(received),
        appliedAmount: asDecimal(applied),
        source: ALLOCATION_SOURCE.BANK,
      });
      remaining -= applied;
    }

    // --- 4. Undo the mistake and free its line ----------------------------
    const reversed = [];
    for (const r of current) {
      const res = await reverseDeposit(
        {
          depositId: r.depositId,
          recordedBy: staffId,
          description: `Re-matched off order #${orderId} — this was not the payment for it`,
        },
        trx,
      );
      if (!res.success) {
        // The only way here is the balance guard: what is being taken away is
        // larger than what replaced it, and the difference is already
        // committed to another order's hold. Say so rather than half-doing it.
        throw Object.assign(
          new Error(
            res.insufficient
              ? `The replacement (${newTotal}) is smaller than the payment being removed, and the difference is already committed elsewhere. Free that up first, or pick lines covering at least as much.`
              : res.message || "Could not reverse the previous payment",
          ),
          { status: 400 },
        );
      }
      reversed.push(r.depositId);

      await trx
        .update(bankStatementLines)
        .set({ status: "UNMATCHED", matchedDepositId: null, matchedOrderId: null, matchedBy: null, matchedAt: null })
        .where(eq(bankStatementLines.matchedDepositId, r.depositId));
    }

    return {
      success: true,
      newDeposits,
      newTotal,
      replacedDepositIds: reversed,
      unattributed: Math.max(0, remaining),
    };
  };
  return tx ? run(tx) : db.transaction(run);
};

/**
 * Reverses allocateOrderFunding() — an order's hold was released, so nothing
 * was actually spent.
 *
 * Gives back `appliedAmount`, not `amount`: on a bank row those differ
 * whenever the payment overshot the order, and only the applied part was ever
 * taken out of the deposit's remainingAmount. Handing back the face value
 * would credit the wallet with a surplus that never left it.
 */
const deallocateOrderFunding = async (orderId, tx) => {
  const rows = await tx
    .select({
      depositId: orderDepositAllocations.depositId,
      appliedAmount: orderDepositAllocations.appliedAmount,
    })
    .from(orderDepositAllocations)
    .where(eq(orderDepositAllocations.orderId, orderId));

  for (const r of rows) {
    await tx
      .update(deposits)
      .set({ remainingAmount: sql`${deposits.remainingAmount} + ${r.appliedAmount}` })
      .where(eq(deposits.id, r.depositId));
  }

  await tx.delete(orderDepositAllocations).where(eq(orderDepositAllocations.orderId, orderId));
};

/**
 * Commit funds to an order. Decrements the balance so the money cannot be
 * spent twice, but writes no ledger row yet — that happens on conversion.
 * The unique index on orderId makes re-attempts fail closed (alreadyHeld)
 * instead of holding the same money twice: if the hold insert below violates
 * it, the whole transaction — including the balance decrement — rolls back.
 */
// An optional `tx` lets a caller (e.g. placeOrder) commit the hold atomically
// with the order it belongs to. Without one, the hold gets its own transaction.
const placeHold = async ({ customerId, orderId, amount, description = "" }, tx) => {
  const value = money(amount);
  if (value <= 0) {
    return { success: false, message: "Hold amount must be positive" };
  }

  const run = async (trx) => {
    const updated = await customerRepo.debitBalance(customerId, value, trx);
    if (!updated) {
      return { success: false, insufficient: true, message: "Insufficient wallet balance" };
    }

    const [hold] = await trx
      .insert(walletHolds)
      .values({
        customerId,
        orderId,
        amount: asDecimal(value),
        description,
      })
      .returning();

    try {
      await allocateOrderFunding(customerId, orderId, value, trx);
    } catch (err) {
      console.error(`[wallet] allocateOrderFunding failed for order ${orderId}:`, err.message);
    }

    return { success: true, hold, customer: updated };
  };

  // Inside a caller's transaction a duplicate-hold violation must propagate —
  // the caller's atomic unit can't be soft-recovered here (Postgres aborts it).
  // The alreadyHeld soft path only applies to the standalone transaction, whose
  // sole retry caller is the settlement sweep.
  if (tx) return run(tx);
  try {
    return await db.transaction(run);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, alreadyHeld: true, message: "A hold already exists for this order" };
    }
    throw err;
  }
};

/**
 * Return held funds to the balance (order cancelled before fulfilment).
 * No ledger rows: the money never actually moved.
 */
const releaseHold = async (orderId, tx) => {
  const run = async (trx) => {
    const [hold] = await trx
      .select()
      .from(walletHolds)
      .where(eq(walletHolds.orderId, orderId))
      .for("update")
      .limit(1);

    if (!hold || hold.status !== "active") {
      return { success: false, noActiveHold: true, hold: hold || null };
    }

    const [updatedHold] = await trx
      .update(walletHolds)
      .set({ status: "released", resolvedAt: new Date() })
      .where(eq(walletHolds.id, hold.id))
      .returning();

    // A release can never overdraw — it is only ever returning money this
    // same hold already took.
    await customerRepo.creditBalance(hold.customerId, money(hold.amount), trx);

    try {
      await deallocateOrderFunding(orderId, trx);
    } catch (err) {
      console.error(`[wallet] deallocateOrderFunding failed for order ${orderId}:`, err.message);
    }

    return { success: true, hold: updatedHold };
  };
  return tx ? run(tx) : db.transaction(run);
};

/**
 * Finalise a hold as a spend (order fulfilled). Writes the debit ledger row;
 * the balance was already reduced when the hold was placed, so it does not
 * change here.
 */
const convertHold = async (orderId, description = "", tx) => {
  const run = async (trx) => {
    const [hold] = await trx
      .select()
      .from(walletHolds)
      .where(eq(walletHolds.orderId, orderId))
      .for("update")
      .limit(1);

    if (!hold || hold.status !== "active") {
      return { success: false, noActiveHold: true, hold: hold || null };
    }

    const [customer] = await trx
      .select()
      .from(customers)
      .where(eq(customers.id, hold.customerId))
      .for("update")
      .limit(1);

    const [deposit] = await trx
      .insert(deposits)
      .values({
        customerId: hold.customerId,
        amount: asDecimal(hold.amount),
        type: "debit",
        description: description || hold.description || "",
        balanceAfter: asDecimal(customer.balance),
      })
      .returning();

    const [updatedHold] = await trx
      .update(walletHolds)
      .set({ status: "converted", depositId: deposit.id, resolvedAt: new Date() })
      .where(eq(walletHolds.id, hold.id))
      .returning();

    return { success: true, hold: updatedHold, deposit };
  };
  return tx ? run(tx) : db.transaction(run);
};

const findHoldByOrder = async (orderId, tx = db) => {
  const [hold] = await tx
    .select()
    .from(walletHolds)
    .where(eq(walletHolds.orderId, orderId))
    .limit(1);
  return hold || null;
};

/**
 * Recompute the balance from the ledger. Equal to customers.balance unless
 * something has written balances outside this service.
 */
const getLedgerBalance = async (customerId) => {
  const [{ credits, debits }] = await db
    .select({
      credits: sql`COALESCE(SUM(CASE WHEN ${deposits.type} = 'credit' THEN ${deposits.amount} ELSE 0 END), 0)`,
      debits: sql`COALESCE(SUM(CASE WHEN ${deposits.type} = 'debit' THEN ${deposits.amount} ELSE 0 END), 0)`,
    })
    .from(deposits)
    .where(eq(deposits.customerId, customerId));

  const [{ held }] = await db
    .select({ held: sql`COALESCE(SUM(${walletHolds.amount}), 0)` })
    .from(walletHolds)
    .where(and(eq(walletHolds.customerId, customerId), eq(walletHolds.status, "active")));

  return money(credits) - money(debits) - money(held);
};

module.exports = {
  ALLOCATION_SOURCE,
  credit,
  creditFromStatementLines,
  debit,
  transfer,
  reverseDeposit,
  reassignHold,
  rematchOrderFunding,
  unmatchStatementDeposit,
  placeHold,
  releaseHold,
  convertHold,
  findHoldByOrder,
  getLedgerBalance,
  allocateOrderFunding,
  deallocateOrderFunding,
};
