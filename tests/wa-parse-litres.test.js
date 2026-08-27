// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { parseLitres } = require("../whatsapp/engine");

describe("wa parseLitres — dot is a thousands separator, never a decimal", () => {
  test("plain and comma/space-grouped values", () => {
    assert.equal(parseLitres("30000"), 30000);
    assert.equal(parseLitres("30,000"), 30000);
    assert.equal(parseLitres("30 000"), 30000);
    assert.equal(parseLitres("30000L"), 30000);
    assert.equal(parseLitres("30k"), 30000);
  });

  test("a dot means thousands, not a fraction (the fixed bug)", () => {
    assert.equal(parseLitres("30.000"), 30000, "was 30 before the fix");
    assert.equal(parseLitres("1.500"), 1500, "was 1.5 before the fix");
    assert.equal(parseLitres("2.500.000"), 2500000);
  });

  test("non-quantities are NaN", () => {
    assert.ok(Number.isNaN(parseLitres("abc")));
    assert.ok(Number.isNaN(parseLitres("")));
    assert.ok(Number.isNaN(parseLitres("thirty")));
  });

  test("every result is a whole number (litres/trucks are integers)", () => {
    for (const v of ["30.000", "1.500", "45,000", "10 000", "5k"]) {
      const n = parseLitres(v);
      assert.equal(n, Math.round(n), `${v} → ${n} must be integer`);
    }
  });
});
