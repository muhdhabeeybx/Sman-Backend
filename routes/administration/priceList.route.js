const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const z = require("zod");
const { getPriceList, previewBody } = require("../../controllers/administration/priceList.controller");

/**
 * The price advisory behind the messaging composer's shortcodes.
 *
 * Admin/super_admin only, the same boundary as the messaging page itself —
 * current prices at every depot, side by side, is the sort of thing that walks
 * out of the building if anyone signed in can fetch it.
 */

const previewSchema = z.object({
  body: z.string().max(2000, "Message is too long").optional().default(""),
  depotIds: z.array(z.number().int().positive()).max(100).optional(),
});

router.get("/", verifyStaff, getPriceList);
router.post("/preview", verifyStaff, validate({ body: previewSchema }), previewBody);

module.exports = router;
