const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const { getStats, getOverview, getWorkQueues } = require("../../controllers/administration/dashboard.controller");

router.get("/stats", verifyStaff, getStats);
router.get("/overview", verifyStaff, getOverview);
// Sidebar badges and the "my work" landing page. Any signed-in staff member —
// it reports how much work is waiting on THEM, scoped to their own locations.
router.get("/work-queues", verifyStaff, getWorkQueues);

module.exports = router;
