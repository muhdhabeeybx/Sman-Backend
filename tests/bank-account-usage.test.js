require("dotenv").config();

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const misc = require("../schemas/misc.schema");

/**
 * A field the write schema does not name is a field the API silently discards.
 *
 * validate() strips unknown keys — that is deliberate, it is what closes mass
 * assignment (see middleware/validate.js). The cost is that forgetting a field
 * fails in the worst possible way: the request validates, the controller runs
 * with an empty body, the API answers 200, and the UI reports success over a
 * write that never happened.
 *
 * `usage` did exactly that. Ticking an account on the Expense Bank Accounts
 * list sent {usage: [...]}, the validator removed it, and the dialog showed a
 * success message with nothing written — including when adding a new account,
 * which was created and then absent from the very list it was added from.
 *
 * These assert on the parsed OUTPUT rather than on `success`, because a
 * stripped field still parses successfully. That is the whole trap.
 */
describe("bank account write schemas", () => {
  test("usage survives an update instead of being silently dropped", () => {
    const result = misc.updateBankAccount.safeParse({ usage: ["expenses"] });
    assert.equal(result.success, true);
    assert.deepEqual(
      result.data.usage,
      ["expenses"],
      "usage was stripped — the PATCH would run with an empty body and still answer 200",
    );
  });

  test("clearing usage is a real value, not a missing one", () => {
    // Un-ticking the last account sends []. If that arrived as undefined the
    // account would keep its tag and the list would not change.
    const result = misc.updateBankAccount.safeParse({ usage: [] });
    assert.equal(result.success, true);
    assert.ok("usage" in result.data, "an empty usage array must reach the controller");
    assert.deepEqual(result.data.usage, []);
  });

  test("an account created from the shortlist keeps the tag it was created with", () => {
    const result = misc.createBankAccount.safeParse({
      bankName: "Moniepoint",
      accountName: "Soroman Kano 1",
      accountNumber: "4005281106",
      status: "Active",
      usage: ["expenses"],
    });
    assert.equal(result.success, true);
    assert.deepEqual(result.data.usage, ["expenses"]);
  });

  test("both areas at once", () => {
    const result = misc.updateBankAccount.safeParse({ usage: ["truck_sales", "expenses"] });
    assert.equal(result.success, true);
    assert.deepEqual(result.data.usage, ["truck_sales", "expenses"]);
  });

  test("an unknown area is refused rather than stored", () => {
    const result = misc.updateBankAccount.safeParse({ usage: ["nonsense"] });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /truck_sales, expenses/);
  });
});
