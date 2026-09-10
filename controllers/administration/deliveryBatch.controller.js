const asyncHandler = require("express-async-handler");
const { deliveryBatchRepo } = require("../../repositories");

/**
 * Closing a delivery batch, and reopening it.
 *
 * A batch is a code and the loads recorded under it, so the code is the
 * identifier here — there is no batch id to take. See
 * db/migrations/0028_delivery_batch_status.sql.
 */

const STATUSES = ["active", "completed"];

/** Every batch that has a status row. Codes with none are active. */
const getDeliveryBatchStatuses = asyncHandler(async (req, res) => {
  const batches = await deliveryBatchRepo.findStatuses();
  res.json({ success: true, data: { batches } });
});

const setDeliveryBatchStatus = asyncHandler(async (req, res) => {
  const code = deliveryBatchRepo.normalise(req.params.code);
  if (!code) {
    return res.status(400).json({ success: false, message: "A batch code is required" });
  }

  const status = String(req.body?.status || "").trim();
  if (!STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of: ${STATUSES.join(", ")}`,
    });
  }

  /**
   * The name is taken from the session, never from the request body. A closed
   * batch says who finished with it, and a client that can name somebody else
   * makes that line worth nothing.
   */
  const staffName = String(req.user?.name || req.user?.email || "").trim();

  const batch = await deliveryBatchRepo.setStatus(code, {
    status,
    staffName,
    note: String(req.body?.note || "").slice(0, 2000),
  });

  res.json({ success: true, data: { batch } });
});

module.exports = { getDeliveryBatchStatuses, setDeliveryBatchStatus };
