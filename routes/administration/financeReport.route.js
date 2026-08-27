const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const { getFinanceReport } = require("../../controllers/administration/financeReport.controller");

router.get("/", verifyStaff, getFinanceReport);

module.exports = router;
