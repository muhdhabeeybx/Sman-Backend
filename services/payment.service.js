const axios = require("axios");

const { virtualAccountName } = require("../utils/helpers");
const { db } = require("../config/db");

// Almost everything this module reached for went with the settlement sweep and
// the Paystack paths below it. What survives is the commented-out reinstatement
// code and a live `verifyTransaction`; the repositories the disabled blocks
// reference are re-required at the top of this file when any of them is
// reinstated.
const { QUEUES, enqueue } = require("../config/queue");

/**
 * Push "payment received" into the customer's WhatsApp conversation. Only the
 * enqueue happens here (no cycle back into the whatsapp module); the
 * wa-events worker decides whether a session exists to re-enter. Guarded on
 * the kill switch so a disabled deployment doesn't accumulate jobs.
 */
const notifyWhatsAppPaymentConfirmed = (orderId) => {
  if (process.env.WHATSAPP_ENABLED !== "true") return;
  enqueue(QUEUES.WA_EVENTS, { type: "payment_confirmed", orderId }).catch((err) =>
    console.error("[wa] payment-confirmed enqueue failed:", err.message)
  );
};

const PAYSTACK_BASE_URL = "https://api.paystack.co";

const getPaystackHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
});

// const splitName = (name) => {
//   const parts = (name || "").trim().split(/\s+/).filter(Boolean);
//   if (parts.length === 0) {
//     return { first_name: "C", last_name: "U" };
//   }
//   const initials = parts.map((p) => p.charAt(0).toUpperCase());
//   return {
//     first_name: initials[0] || "",
//     last_name: initials.slice(1).join(" ") || initials[0] || "",
//   };
// };

const splitName = (name) => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return {
      first_name: "C",
      last_name: "U",
    };
  }

  const initials = parts.map((p) => p.charAt(0).toUpperCase());
  return {
    first_name: initials[0],
    last_name: initials.slice(1).join("") || initials[0],
  };
};

// Paystack provisions no real bank accounts on a test key: dedicated
// accounts in test mode must ask for "test-bank" or the call is refused —
// which made DVA creation impossible in development for any customer who
// didn't already have one (the WhatsApp flow's fresh customers being the
// first real path to hit it).
const preferredBank = () =>
  (process.env.PAYSTACK_SECRET_KEY || "").startsWith("sk_test") ? "test-bank" : "wema-bank";

/* --- Paystack DVA creation (disabled — manual deposit only) ----------------
 * Customer wallet funding no longer goes through a personal Paystack
 * Dedicated Virtual Account; deposits are entered manually by staff on the
 * admin dashboard, and orders show the depot's own bank account instead (see
 * order.service.js placeOrder). Kept commented, not deleted, so this can be
 * flipped back on by restoring the body below and removing the stub.
 *
 * const createDedicatedAccount = async (customer) => {
 *   try {
 *     let paystackCustomerId = customer.paystackCustomerId || "";
 *     const { first_name, last_name } = splitName(customer.name);
 *
 *     if (!paystackCustomerId) {
 *       const customerPayload = {
 *         first_name,
 *         last_name,
 *         email: customer.email || `customer-${customer._id || customer.id}@soroman.com`,
 *         phone: customer.phone,
 *       };
 *
 *       const customerResponse = await axios.post(
 *         `${PAYSTACK_BASE_URL}/customer`,
 *         customerPayload,
 *         { headers: getPaystackHeaders() }
 *       );
 *
 *       if (customerResponse.data.status) {
 *         paystackCustomerId = customerResponse.data.data.customer_code;
 *       } else {
 *         return { success: false, message: "Failed to create Paystack customer" };
 *       }
 *     }
 *
 *     const response = await axios.post(
 *       `${PAYSTACK_BASE_URL}/dedicated_account`,
 *       {
 *         customer: paystackCustomerId,
 *         first_name,
 *         last_name,
 *         email: customer.email || `customer-${customer._id || customer.id}@soroman.com`,
 *         phone: customer.phone,
 *         preferred_bank: preferredBank(),
 *       },
 *       { headers: getPaystackHeaders() }
 *     );
 *
 *     if (response.data.status) {
 *       const data = response.data.data;
 *       const accountName = data.account_name || virtualAccountName(customer.name);
 *       return {
 *         success: true,
 *         data: {
 *           paystackCustomerId: data.customer?.customer_code || paystackCustomerId,
 *           accountNumber: data.account_number,
 *           bankName: data.bank?.name,
 *           accountName,
 *         },
 *       };
 *     }
 *
 *     return { success: false, message: "Paystack request failed" };
 *   } catch (error) {
 *     const errMsg =
 *       error.response?.data?.message || error.message || "Paystack error";
 *     console.error("Paystack dedicated account error:", errMsg);
 *     return { success: false, message: errMsg };
 *   }
 * };
 * --------------------------------------------------------------------- */
const createDedicatedAccount = async () => ({
  success: false,
  disabled: true,
  message: "Paystack DVA funding is disabled — wallets are funded by manual deposit only",
});

const verifyTransaction = async (reference) => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      { headers: getPaystackHeaders() }
    );

    if (response.data.status) {
      return { success: true, data: response.data.data };
    }

    return { success: false, message: "Verification failed" };
  } catch (error) {
    const errMsg =
      error.response?.data?.message || error.message || "Verification error";
    console.error("Paystack verify error:", errMsg);
    return { success: false, message: errMsg };
  }
};

/* --- Paystack payment processing (disabled — manual deposit only) ---------
 * Verified an incoming Paystack transaction (DVA credit or otherwise) and
 * credited the matching customer's wallet. No new Paystack DVA payments can
 * arrive now that createDedicatedAccount is disabled, so this is parked
 * rather than deleted — the webhook route and the admin "sync" endpoint both
 * call the stub below instead. Restore this body and remove the stub to
 * reinstate.
 *
 * const processPaystackPayment = async (paystackData, rawEventName = "manual_sync") => {
 *   const reference = paystackData?.reference || "";
 *   if (!reference) {
 *     return { success: false, message: "Missing reference in transaction data" };
 *   }
 *
 *   // Idempotency check
 *   const existingDeposit = await depositRepo.findByReference(reference);
 *   // Delivery sales are no longer auto-settled from DVA payments, but rows
 *   // recorded before that path was removed still carry Paystack references —
 *   // this keeps a replayed old webhook from crediting a wallet instead.
 *   const existingDeliverySale = await deliverySaleRepo.findByPaystackReference(reference);
 *   if (existingDeposit || existingDeliverySale) {
 *     return {
 *       success: true,
 *       alreadyProcessed: true,
 *       message: `Transaction reference ${reference} has already been recorded.`,
 *       deposit: existingDeposit,
 *       deliverySale: existingDeliverySale,
 *     };
 *   }
 *
 *   // Verify transaction with Paystack
 *   const verification = await verifyTransaction(reference);
 *   if (!verification.success || verification.data?.status !== "success") {
 *     return {
 *       success: false,
 *       message: `Paystack transaction verification failed for reference: ${reference}`,
 *     };
 *   }
 *
 *   const vData = verification.data;
 *   const amount = vData.amount / 100;
 *   if (amount <= 0) {
 *     return { success: false, message: `Verified amount is invalid or zero for reference: ${reference}` };
 *   }
 *
 *   const accountNumber = (
 *     paystackData?.dedicated_account?.account_number ||
 *     paystackData?.authorization?.receiver_bank_account_number ||
 *     paystackData?.authorization?.receiver_bank_account ||
 *     paystackData?.receiver_account_number ||
 *     vData?.dedicated_account?.account_number ||
 *     vData?.authorization?.receiver_bank_account_number ||
 *     (Array.isArray(vData?.customer?.dedicated_accounts) && vData.customer.dedicated_accounts[0]?.account_number) ||
 *     ""
 *   ).toString().trim();
 *
 *   const customerCode = (vData?.customer?.customer_code || paystackData?.customer?.customer_code || "").trim();
 *   const customerEmail = (vData?.customer?.email || paystackData?.customer?.email || "").trim();
 *
 *   const paystackDetails = {
 *     transactionId: vData.id || null,
 *     domain: vData.domain || null,
 *     status: vData.status || null,
 *     reference: reference,
 *     amount: amount,
 *     currency: vData.currency || "NGN",
 *     channel: vData.channel || null,
 *     gatewayResponse: vData.gateway_response || null,
 *     message: vData.message || null,
 *     paidAt: vData.paid_at || null,
 *     createdAt: vData.created_at || null,
 *     fees: vData.fees != null ? vData.fees / 100 : null,
 *     senderBankName:
 *       paystackData?.authorization?.sender_bank ||
 *       vData.authorization?.sender_bank ||
 *       vData.authorization?.bank ||
 *       null,
 *     senderAccountNumber:
 *       paystackData?.authorization?.sender_bank_account_number ||
 *       vData.authorization?.sender_bank_account_number ||
 *       vData.authorization?.last4 ||
 *       null,
 *     senderName:
 *       paystackData?.authorization?.sender_name ||
 *       vData.authorization?.sender_name ||
 *       vData.authorization?.account_name ||
 *       null,
 *     senderCountry: paystackData?.authorization?.sender_country || null,
 *     senderNarration: paystackData?.authorization?.narration || null,
 *     receiverBankName: paystackData?.dedicated_account?.bank?.name || vData?.dedicated_account?.bank?.name || null,
 *     receiverAccountNumber: accountNumber,
 *     receiverAccountName: paystackData?.dedicated_account?.account_name || vData?.dedicated_account?.account_name || null,
 *     authorizationCode: vData.authorization?.authorization_code || null,
 *     bin: vData.authorization?.bin || null,
 *     last4: vData.authorization?.last4 || null,
 *     cardType: vData.authorization?.card_type || null,
 *     bank: vData.authorization?.bank || null,
 *     ipAddress: vData.ip_address || null,
 *     metadata: vData.metadata || null,
 *     paystackCustomerCode: customerCode || null,
 *     paystackCustomerEmail: customerEmail || null,
 *     rawEvent: rawEventName,
 *   };
 *
 *   // Wallet customers only. The delivery sales ledger is keyed in manually —
 *   // payments arriving on a delivery customer's account are deliberately NOT
 *   // auto-recorded; they stay in webhook_events as unmatched for staff to
 *   // enter by hand, exactly like the paper process.
 *   let customer = null;
 *
 *   if (accountNumber) {
 *     customer = await customerRepo.findByVirtualAccount(accountNumber);
 *   }
 *
 *   if (!customer && customerCode) {
 *     customer = await customerRepo.findByPaystackCustomerId(customerCode);
 *   }
 *
 *   if (!customer && customerEmail) {
 *     customer = await customerRepo.findByEmail(customerEmail);
 *   }
 *
 *   if (customer) {
 *     // Ledger row + balance update happen atomically, and the unique index on
 *     // deposits.reference makes a concurrent duplicate webhook a no-op.
 *     const creditResult = await walletService.credit({
 *       customerId: customer.id,
 *       amount,
 *       description: "Payment received via bank transfer",
 *       reference,
 *       paystackDetails,
 *     });
 *
 *     if (creditResult.alreadyProcessed) {
 *       return {
 *         success: true,
 *         alreadyProcessed: true,
 *         message: creditResult.message,
 *         deposit: creditResult.deposit,
 *       };
 *     }
 *
 *     return {
 *       success: true,
 *       customerType: "customer",
 *       customer: creditResult.customer,
 *       deposit: creditResult.deposit,
 *       amount: amount,
 *       reference: reference,
 *     };
 *   } else {
 *     return {
 *       success: false,
 *       message: `No wallet customer found matching virtual account '${accountNumber}', customer code '${customerCode}', or email '${customerEmail}'. If this is a delivery customer payment, enter it in the delivery sales ledger manually.`,
 *     };
 *   }
 * };
 * --------------------------------------------------------------------- */
const processPaystackPayment = async () => ({
  success: false,
  disabled: true,
  message: "Paystack payments are disabled — wallets are funded by manual deposit only",
});

/* --- Settlement sweep (removed — order-first payments) --------------------
 *
 * processUnpaidOrdersForCustomer() walked a customer's unpaid orders and paid
 * every one the wallet balance could cover, oldest first. processAllUnpaidOrders()
 * did that for every customer with a balance.
 *
 * This is the sharpest form of the automatic draw the finance desk asked to be
 * rid of. A deposit recorded to settle one order could silently settle a
 * different, older one, and nothing anywhere recorded which bank payment had
 * paid for which order — the finance report then inferred it, wrongly, and the
 * desk spent its time reconciling a machine's guesses.
 *
 * The HTTP endpoint has returned 410 since before this change (see
 * settlement.controller.js). The functions are removed rather than left
 * dormant so that re-enabling the endpoint cannot quietly reinstate the
 * behaviour: an order is paid by naming the bank statement line that paid for
 * it, and only the finance desk can do that. See db/migrations/0021 and
 * services/orderPayment.service.js.
 * ------------------------------------------------------------------------ */
const settlementSweepRemoved = () => {
  throw Object.assign(
    new Error(
      "The settlement sweep is gone. An order is paid by matching the bank statement line that paid for it — see services/orderPayment.service.js.",
    ),
    { status: 410 },
  );
};
const processUnpaidOrdersForCustomer = settlementSweepRemoved;
const processAllUnpaidOrders = settlementSweepRemoved;

/* --- Paystack auto-split transfers (disabled — manual deposit only) -------
 * transferToDepotSubaccount / transferToStationSubaccount pushed the depot's
 * or station's share of a Paystack-collected payment out of the merchant
 * balance to their bank account. Now that customers pay straight into the
 * depot/station's own bank account (see order.service.js placeOrder and
 * lpgOrder.controller.js reviewLpgOrderRequest), there is no merchant-balance
 * share left to move. Kept for reinstatement.
 *
 * const transferToDepotSubaccount = async (order) => {
 *   try {
 *     const depot = await depotRepo.findById(order.depotId);
 *     if (!depot) return { success: false, message: "Depot not found" };
 *
 *     const subaccountCode = depot.paystackSubaccountCode || depot.paystack_subaccount_code;
 *     const isActive = depot.subaccountActive ?? depot.subaccount_active;
 *
 *     if (!isActive) {
 *       return { success: false, message: "Depot subaccount not active" };
 *     }
 *
 *     const splitPct = depot.subaccountSplitPercentage ?? depot.subaccount_split_percentage ?? 100;
 *     const orderAmount = Number(order.totalAmount || 0);
 *     const transferAmount = Math.round(orderAmount * (splitPct / 100) * 100); // kobo
 *
 *     if (transferAmount <= 0) {
 *       return { success: false, message: "Transfer amount is zero" };
 *     }
 *
 *     // Get linked active bank account for this depot
 *     const linkedAccounts = await bankAccountRepo.findAll({ depotId: depot.id, status: "Active" });
 *     if (!linkedAccounts || linkedAccounts.length === 0) {
 *       return { success: false, message: `No active bank account linked to depot ${depot.name}` };
 *     }
 *
 *     const bankAccount = linkedAccounts[0];
 *     if (!bankAccount.bankCode || !bankAccount.accountNumber) {
 *       return { success: false, message: `Bank account ${bankAccount.id} missing bankCode or accountNumber` };
 *     }
 *
 *     // 1. Create a transfer recipient for the bank account (Paystack requires type: "nuban")
 *     const recipientResponse = await axios.post(
 *       `${PAYSTACK_BASE_URL}/transferrecipient`,
 *       {
 *         type: "nuban",
 *         name: bankAccount.accountName || `Depot ${depot.code || depot.name}`,
 *         account_number: bankAccount.accountNumber,
 *         bank_code: bankAccount.bankCode,
 *         currency: bankAccount.currency || "NGN",
 *         description: `Depot ${depot.code || depot.name}`,
 *       },
 *       { headers: getPaystackHeaders() }
 *     );
 *
 *     if (!recipientResponse.data.status) {
 *       return { success: false, message: "Failed to create transfer recipient" };
 *     }
 *
 *     const recipientCode = recipientResponse.data.data.recipient_code;
 *
 *     // 2. Initiate the transfer from main balance to depot bank account
 *     const reference = `depot-${depot.id}-order-${order.id}-${Date.now()}`;
 *     const transferResponse = await axios.post(
 *       `${PAYSTACK_BASE_URL}/transfer`,
 *       {
 *         source: "balance",
 *         amount: transferAmount,
 *         recipient: recipientCode,
 *         reason: `Order ${order.orderNumber || order.id} - depot share (${splitPct}%)`,
 *         reference,
 *       },
 *       { headers: getPaystackHeaders() }
 *     );
 *
 *     if (transferResponse.data.status) {
 *       console.log(
 *         `[subaccount] Transfer ${reference}: ${transferAmount / 100} NGN → depot ${depot.id} (${bankAccount.bankName} - ${bankAccount.accountNumber})`
 *       );
 *       return {
 *         success: true,
 *         reference,
 *         amount: transferAmount / 100,
 *         transferCode: transferResponse.data.data.transfer_code,
 *       };
 *     }
 *
 *     return { success: false, message: "Transfer initiation failed" };
 *   } catch (error) {
 *     const errMsg =
 *       error.response?.data?.message || error.message || "Transfer error";
 *     console.error(`[subaccount] transfer failed for order ${order.id}:`, errMsg);
 *     return { success: false, message: errMsg };
 *   }
 * };
 *
 * const transferToStationSubaccount = async (lpgOrder) => {
 *   try {
 *     const stationId = lpgOrder.lpgStationId || lpgOrder.stationId;
 *     const station = await lpgStationRepo.findById(stationId);
 *     if (!station) return { success: false, message: "LPG Station not found" };
 *
 *     const subaccountCode = station.paystackSubaccountCode || station.paystack_subaccount_code;
 *     const isActive = station.subaccountActive ?? station.subaccount_active;
 *
 *     if (!isActive) {
 *       return { success: false, message: "LPG station subaccount not active" };
 *     }
 *
 *     const splitPct = station.subaccountSplitPercentage ?? station.subaccount_split_percentage ?? 100;
 *     const orderAmount = Number(lpgOrder.totalAmount || 0);
 *     const transferAmount = Math.round(orderAmount * (splitPct / 100) * 100); // kobo
 *
 *     if (transferAmount <= 0) {
 *       return { success: false, message: "Transfer amount is zero" };
 *     }
 *
 *     const linkedAccounts = await bankAccountRepo.findAll({ lpgStationId: station.id, status: "Active" });
 *     if (!linkedAccounts || linkedAccounts.length === 0) {
 *       return { success: false, message: `No active bank account linked to station ${station.name}` };
 *     }
 *
 *     const bankAccount = linkedAccounts[0];
 *     if (!bankAccount.bankCode || !bankAccount.accountNumber) {
 *       return { success: false, message: `Bank account ${bankAccount.id} missing bankCode or accountNumber` };
 *     }
 *
 *     const recipientResponse = await axios.post(
 *       `${PAYSTACK_BASE_URL}/transferrecipient`,
 *       {
 *         type: "nuban",
 *         name: bankAccount.accountName || `Station ${station.code || station.name}`,
 *         account_number: bankAccount.accountNumber,
 *         bank_code: bankAccount.bankCode,
 *         currency: bankAccount.currency || "NGN",
 *         description: `Station ${station.code || station.name}`,
 *       },
 *       { headers: getPaystackHeaders() }
 *     );
 *
 *     if (!recipientResponse.data.status) {
 *       return { success: false, message: "Failed to create transfer recipient" };
 *     }
 *
 *     const recipientCode = recipientResponse.data.data.recipient_code;
 *     const reference = `station-${station.id}-lpgorder-${lpgOrder.id}-${Date.now()}`;
 *     const transferResponse = await axios.post(
 *       `${PAYSTACK_BASE_URL}/transfer`,
 *       {
 *         source: "balance",
 *         amount: transferAmount,
 *         recipient: recipientCode,
 *         reason: `LPG Order ${lpgOrder.requestNumber || lpgOrder.id} - station share (${splitPct}%)`,
 *         reference,
 *       },
 *       { headers: getPaystackHeaders() }
 *     );
 *
 *     if (transferResponse.data.status) {
 *       console.log(
 *         `[subaccount] Transfer ${reference}: ${transferAmount / 100} NGN → station ${station.id} (${bankAccount.bankName} - ${bankAccount.accountNumber})`
 *       );
 *       return {
 *         success: true,
 *         reference,
 *         amount: transferAmount / 100,
 *         transferCode: transferResponse.data.data.transfer_code,
 *       };
 *     }
 *
 *     return { success: false, message: "Transfer initiation failed" };
 *   } catch (error) {
 *     const errMsg = error.response?.data?.message || error.message || "Transfer error";
 *     console.error(`[subaccount] transfer failed for LPG order ${lpgOrder.id}:`, errMsg);
 *     return { success: false, message: errMsg };
 *   }
 * };
 * --------------------------------------------------------------------- */
const transferToDepotSubaccount = async () => ({
  success: false,
  disabled: true,
  message: "Paystack auto-split transfers are disabled — depots are paid by manual deposit only",
});

const transferToStationSubaccount = async () => ({
  success: false,
  disabled: true,
  message: "Paystack auto-split transfers are disabled — stations are paid by manual deposit only",
});

/* --- Paystack DVA→subaccount switching (disabled — manual deposit only) ---
 * Switch / bind a customer's Dedicated Virtual Account (DVA) to a depot's
 * Paystack Subaccount. Uses Paystack API: POST /dedicated_account/split
 * No DVAs are created anymore (see createDedicatedAccount above), so there is
 * nothing left to switch. Kept for reinstatement.
 *
 * const switchCustomerDvaToSubaccount = async ({ accountNumber, subaccountCode }) => {
 *   if (!accountNumber || !subaccountCode) {
 *     return { success: false, message: "Missing account number or subaccount code" };
 *   }
 *   try {
 *     const response = await axios.post(
 *       `${PAYSTACK_BASE_URL}/dedicated_account/split`,
 *       {
 *         account_number: accountNumber,
 *         subaccount: subaccountCode,
 *       },
 *       { headers: getPaystackHeaders() }
 *     );
 *
 *     if (response.data?.status) {
 *       console.log(`[dva-subaccount] Switched DVA ${accountNumber} to subaccount ${subaccountCode}`);
 *       return { success: true, data: response.data.data };
 *     }
 *     return { success: false, message: response.data?.message || "Failed to split DVA to subaccount" };
 *   } catch (error) {
 *     const errMsg = error.response?.data?.message || error.message || "Paystack DVA split error";
 *     console.error(`[dva-subaccount] Failed to switch DVA ${accountNumber} to subaccount ${subaccountCode}:`, errMsg);
 *     return { success: false, message: errMsg };
 *   }
 * };
 * --------------------------------------------------------------------- */
const switchCustomerDvaToSubaccount = async () => ({
  success: false,
  disabled: true,
  message: "Paystack DVA funding is disabled — wallets are funded by manual deposit only",
});

module.exports = {
  createDedicatedAccount,
  verifyTransaction,
  processPaystackPayment,
  processUnpaidOrdersForCustomer,
  processAllUnpaidOrders,
  transferToDepotSubaccount,
  transferToStationSubaccount,
  switchCustomerDvaToSubaccount,
};

