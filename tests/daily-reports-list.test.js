// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { staffToken, closeDb } = require("./helpers");

const URL = "/api/daily-reports";

/**
 * The exact request the My Report page makes.
 *
 * This endpoint's query schema hand-rolls its pagination rather than
 * extending schemas/fields.js#pagination, so when the dashboard moved every
 * list to 1000 rows a page nothing here followed it. The page asked for
 * limit=1000 and got a flat 400 — no reports for anybody, on the one screen
 * whose job is showing you what you filed, and it reads exactly like empty
 * data rather than like a broken request.
 *
 * Pinned here because that is a failure nobody can see by looking.
 */
describe("daily reports list — the page's own request shape", () => {
  after(async () => {
    await closeDb();
  });

  test("accepts the 1000-row page the dashboard asks every list for", async () => {
    const token = await staffToken(request, app);
    const res = await request(app)
      .get(URL)
      .query({ page: 1, limit: 1000 })
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data.reports));
    assert.ok(res.body.data.pagination);
  });

  test("returns every report type when none is asked for", async () => {
    const token = await staffToken(request, app);
    const res = await request(app)
      .get(URL)
      .query({ page: 1, limit: 1000 })
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 200);
    // No reportType filter went out, so nothing may be filtered on the way back.
    assert.equal(res.body.success, true);
  });

  test("still refuses a limit beyond what the repository will serve", async () => {
    const token = await staffToken(request, app);
    const res = await request(app)
      .get(URL)
      .query({ page: 1, limit: 5000 })
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 400);
  });

  test("requires authentication", async () => {
    const res = await request(app).get(URL);
    assert.equal(res.status, 401);
  });
});
