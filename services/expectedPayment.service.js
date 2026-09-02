const { expectedPaymentRepo, orderRepo } = require("../repositories");

/**
 * Note what a customer says is coming, before the money shows up.
 *
 * Purely advisory — see db/schema/expectedPayment.js. Nothing here moves
 * money, settles an order or blocks a deposit; it exists so a bare bank
 * transfer with nothing but a depositor name has something concrete to be
 * matched against when the finance desk confirms payment. The dashboard shows
 * these on the confirm-payment dialog for exactly that reason.
 *
 * `reference` carries the name the transfer will arrive under, matching what
 * the desk's own order wizard writes (CompletionStep sends the company name as
 * `reference` and leaves `note` empty) — the confirm dialog renders the two
 * joined, so a WhatsApp-captured split and a desk-captured one read alike.
 *
 * depot/PFI are inherited from the order so the row is location-scoped the way
 * the order is. Raised without an order there is nothing to inherit, and it
 * stays unattributed — the same rule deposits follow.
 */
const noteExpectedPayments = async ({ orderId = null, customerId, entries = [], createdBy = null }) => {
  if (!customerId || !Array.isArray(entries) || entries.length === 0) return [];

  let depotId = null;
  let pfiId = null;
  if (orderId) {
    const order = await orderRepo.findById(Number(orderId));
    if (order) {
      depotId = order.depotId ?? null;
      pfiId = order.pfiId ?? null;
    }
  }

  const rows = [];
  for (const entry of entries) {
    const amount = entry?.amount;
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    // An entry with neither a figure nor a name says nothing worth storing —
    // the same test the desk wizard applies before it submits a row.
    if (!(Number(amount) > 0) && !name) continue;
    rows.push(
      await expectedPaymentRepo.create({
        customerId: Number(customerId),
        orderId: orderId ? Number(orderId) : null,
        depotId,
        pfiId,
        expectedAmount: Number(amount) > 0 ? String(amount) : null,
        reference: name.slice(0, 255),
        note: "",
        createdBy,
      })
    );
  }
  return rows;
};

module.exports = { noteExpectedPayments };
