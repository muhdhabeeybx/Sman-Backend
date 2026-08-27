const axios = require("axios");
const { depotRepo, lpgStationRepo, bankAccountRepo } = require("../repositories");

const PAYSTACK_BASE_URL = "https://api.paystack.co";

const getPaystackHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
});

/* --- Paystack depot subaccount (disabled — manual deposit only) -----------
 * Created/updated a Paystack subaccount for a depot so a customer's DVA
 * payment could auto-split to it. Customers now pay straight into the
 * depot's own bank account (no Paystack in the loop), so there is nothing
 * left to subaccount. Kept for reinstatement.
 *
 * const createOrUpdateSubaccount = async (depot, bankAccount) => {
 *   try {
 *     const payload = {
 *       business_name: depot.name,
 *       settlement_bank: bankAccount.bankCode,
 *       account_number: bankAccount.accountNumber,
 *       percentage_charge: 0,
 *       description: `Depot ${depot.code} - ${depot.name}`,
 *     };
 *
 *     // If depot already has a subaccount code, update instead of create
 *     if (depot.paystackSubaccountCode) {
 *       const response = await axios.put(
 *         `${PAYSTACK_BASE_URL}/subaccount/${depot.paystackSubaccountCode}`,
 *         payload,
 *         { headers: getPaystackHeaders() }
 *       );
 *
 *       if (response.data.status) {
 *         await depotRepo.updateSubaccountFields(depot.id, {
 *           subaccountActive: true,
 *         });
 *         return { success: true, subaccountCode: depot.paystackSubaccountCode };
 *       }
 *
 *       return { success: false, message: "Paystack update subaccount failed" };
 *     }
 *
 *     // Create new subaccount
 *     const response = await axios.post(
 *       `${PAYSTACK_BASE_URL}/subaccount`,
 *       payload,
 *       { headers: getPaystackHeaders() }
 *     );
 *
 *     if (response.data.status) {
 *       const subaccountCode = response.data.data.subaccount_code;
 *       await depotRepo.updateSubaccountFields(depot.id, {
 *         paystackSubaccountCode: subaccountCode,
 *         subaccountActive: true,
 *       });
 *       return { success: true, subaccountCode };
 *     }
 *
 *     return { success: false, message: "Paystack create subaccount failed" };
 *   } catch (error) {
 *     const errMsg =
 *       error.response?.data?.message || error.message || "Paystack error";
 *     console.error("Paystack subaccount error:", errMsg);
 *     return { success: false, message: errMsg };
 *   }
 * };
 * --------------------------------------------------------------------- */
const createOrUpdateSubaccount = async () => ({
  success: false,
  disabled: true,
  message: "Paystack subaccounts are disabled — depots are paid by manual deposit only",
});

/**
 * Deactivate a depot's subaccount (mark inactive in DB).
 */
const deactivateSubaccount = async (depotId) => {
  await depotRepo.updateSubaccountFields(depotId, {
    subaccountActive: false,
  });
};

/**
 * Sync a depot's subaccount state based on its currently assigned bank
 * accounts. If the depot has at least one active bank account assigned,
 * creates or updates the subaccount. If none, deactivates it.
 */
const syncSubaccountForDepot = async (depotId) => {
  try {
    const depot = await depotRepo.findById(depotId);
    if (!depot) return;

    // Find all bank accounts that include this depot in their depot_ids
    const allAccounts = await bankAccountRepo.findAll();
    const linkedAccounts = allAccounts.filter(
      (acc) =>
        acc.status === "Active" &&
        acc.depotIds.map(Number).includes(Number(depotId))
    );

    if (linkedAccounts.length === 0) {
      await deactivateSubaccount(depotId);
      return;
    }

    // Use the first active bank account for the subaccount
    const bankAccount = linkedAccounts[0];
    if (!bankAccount.bankCode || !bankAccount.accountNumber) {
      console.warn(
        `Bank account ${bankAccount.id} missing bankCode or accountNumber — skipping subaccount sync for depot ${depotId}`
      );
      await deactivateSubaccount(depotId);
      return;
    }

    await createOrUpdateSubaccount(
      {
        id: depot.id,
        name: depot.name,
        code: depot.code,
        paystackSubaccountCode: depot.paystackSubaccountCode || "",
      },
      bankAccount
    );
  } catch (err) {
    console.error(
      `Failed to sync subaccount for depot ${depotId}:`,
      err.message
    );
  }
};

/* --- Paystack LPG station subaccount (disabled — manual deposit only) -----
 * Same story as createOrUpdateSubaccount above, for LPG stations. Kept for
 * reinstatement.
 *
 * const createOrUpdateSubaccountForStation = async (station, bankAccount) => {
 *   try {
 *     const payload = {
 *       business_name: station.name,
 *       settlement_bank: bankAccount.bankCode,
 *       account_number: bankAccount.accountNumber,
 *       percentage_charge: 0,
 *       description: `LPG Station ${station.code} - ${station.name}`,
 *     };
 *
 *     if (station.paystackSubaccountCode) {
 *       const response = await axios.put(
 *         `${PAYSTACK_BASE_URL}/subaccount/${station.paystackSubaccountCode}`,
 *         payload,
 *         { headers: getPaystackHeaders() }
 *       );
 *
 *       if (response.data.status) {
 *         await lpgStationRepo.updateSubaccountFields(station.id, {
 *           subaccountActive: true,
 *         });
 *         return { success: true, subaccountCode: station.paystackSubaccountCode };
 *       }
 *
 *       return { success: false, message: "Paystack update station subaccount failed" };
 *     }
 *
 *     const response = await axios.post(
 *       `${PAYSTACK_BASE_URL}/subaccount`,
 *       payload,
 *       { headers: getPaystackHeaders() }
 *     );
 *
 *     if (response.data.status) {
 *       const subaccountCode = response.data.data.subaccount_code;
 *       await lpgStationRepo.updateSubaccountFields(station.id, {
 *         paystackSubaccountCode: subaccountCode,
 *         subaccountActive: true,
 *       });
 *       return { success: true, subaccountCode };
 *     }
 *
 *     return { success: false, message: "Paystack create station subaccount failed" };
 *   } catch (error) {
 *     const errMsg = error.response?.data?.message || error.message || "Paystack error";
 *     console.error("Paystack station subaccount error:", errMsg);
 *     return { success: false, message: errMsg };
 *   }
 * };
 * --------------------------------------------------------------------- */
const createOrUpdateSubaccountForStation = async () => ({
  success: false,
  disabled: true,
  message: "Paystack subaccounts are disabled — stations are paid by manual deposit only",
});

const deactivateSubaccountForStation = async (stationId) => {
  await lpgStationRepo.updateSubaccountFields(stationId, {
    subaccountActive: false,
  });
};

/**
 * Sync an LPG station's subaccount state based on its assigned bank accounts.
 */
const syncSubaccountForStation = async (stationId) => {
  try {
    const station = await lpgStationRepo.findById(Number(stationId));
    if (!station) return;

    const allAccounts = await bankAccountRepo.findAll();
    const linkedAccounts = allAccounts.filter(
      (acc) =>
        acc.status === "Active" &&
        acc.lpgStationIds.map(Number).includes(Number(stationId))
    );

    if (linkedAccounts.length === 0) {
      await deactivateSubaccountForStation(stationId);
      return;
    }

    const bankAccount = linkedAccounts[0];
    if (!bankAccount.bankCode || !bankAccount.accountNumber) {
      console.warn(
        `Bank account ${bankAccount.id} missing bankCode or accountNumber — skipping subaccount sync for station ${stationId}`
      );
      await deactivateSubaccountForStation(stationId);
      return;
    }

    await createOrUpdateSubaccountForStation(
      {
        id: station.id,
        name: station.name,
        code: station.code,
        paystackSubaccountCode: station.paystackSubaccountCode || "",
      },
      bankAccount
    );
  } catch (err) {
    console.error(`Failed to sync subaccount for station ${stationId}:`, err.message);
  }
};

module.exports = {
  createOrUpdateSubaccount,
  deactivateSubaccount,
  syncSubaccountForDepot,
  createOrUpdateSubaccountForStation,
  deactivateSubaccountForStation,
  syncSubaccountForStation,
};
