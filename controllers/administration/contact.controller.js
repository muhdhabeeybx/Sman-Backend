const asyncHandler = require("express-async-handler");
const { contactRepo, customerRepo } = require("../../repositories");
const { toE164 } = require("../../utils/phone");

/**
 * Contacts — the people who are not customers yet.
 *
 * Phone numbers are stored as `toE164` produced them where it can parse the
 * input, exactly as the customer controller does, so the same person keyed in
 * two different ways is stored one way. Where it cannot parse (a landline, a
 * short code, something mistyped in a spreadsheet) the raw text is kept
 * rather than the row being rejected — the generated `phone_normalized`
 * column is what actually deduplicates, and a number too odd to parse is
 * still worth holding on to.
 */
const normalizeOrKeep = (phone) => (phone ? toE164(phone) || String(phone).trim() : phone);

const getContacts = asyncHandler(async (req, res) => {
  const {
    search, stage, source, locationId, converted, optedOut, tag, sort,
    page = 1, limit = 50,
  } = req.query;

  const result = await contactRepo.findAll({
    search, stage, source, locationId, converted, optedOut, tag, sort, page, limit,
  });

  res.json({ success: true, data: result });
});

const getContactTags = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { tags: await contactRepo.findTags() } });
});

const getContactById = asyncHandler(async (req, res) => {
  const contact = await contactRepo.findById(req.params.id);
  if (!contact) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }
  res.json({ success: true, data: { contact } });
});

const createContact = asyncHandler(async (req, res) => {
  const phone = normalizeOrKeep(req.body.phone);

  // A number already on the customer book is not a lead. Saying so is more
  // useful than a unique-violation on a column the caller cannot see, and it
  // stops the same person being worked as a prospect and sold to at once.
  const existingCustomer = await contactRepo.findCustomerByPhone(phone);
  if (existingCustomer) {
    return res.status(409).json({
      success: false,
      message: `${existingCustomer.name} is already a customer on this number.`,
    });
  }

  const contact = await contactRepo.create({
    ...req.body,
    phone,
    createdBy: req.user?.id ?? null,
  });

  res.status(201).json({ success: true, message: "Contact added", data: { contact } });
});

const updateContact = asyncHandler(async (req, res) => {
  const existing = await contactRepo.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }

  const data = { ...req.body };
  if (data.phone) data.phone = normalizeOrKeep(data.phone);

  const contact = await contactRepo.update(existing.id, data);
  res.json({ success: true, message: "Contact updated", data: { contact } });
});

const deleteContact = asyncHandler(async (req, res) => {
  const contact = await contactRepo.deleteById(req.params.id);
  if (!contact) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }
  res.json({ success: true, message: "Contact removed" });
});

/**
 * POST /api/contacts/import/preview — what this spreadsheet would do.
 *
 * A dry run against both books. Nothing is written, so the person choosing the
 * file finds out that 400 of their 480 rows are already on file, that six are
 * already customers and that two are not phone numbers at all — before they
 * commit, not from a summary line afterwards.
 */
const previewImport = asyncHandler(async (req, res) => {
  const rows = req.body.rows.map((r) => ({ ...r, phone: normalizeOrKeep(r.phone) }));
  res.json({ success: true, data: await contactRepo.previewImport(rows) });
});

/**
 * POST /api/contacts/import — a parsed spreadsheet.
 *
 * Reports inserted / updated / skipped rather than just a count, because
 * "480 imported" over a re-uploaded file tells nobody whether they added 480
 * people or re-saved the same 480. Skipped rows are the ones with no usable
 * name or number; they are counted, not silently dropped.
 *
 * `mode` is the choice the preview exists to inform:
 *   upsert    (default) correct the people already on file from this sheet
 *   new_only  leave them alone; add only the numbers not already held
 *
 * Rows whose number cannot be parsed are refused in both modes, and so is
 * anyone who already has a customer account — see importMany for why.
 */
const importContacts = asyncHandler(async (req, res) => {
  const rows = req.body.rows.map((r) => ({ ...r, phone: normalizeOrKeep(r.phone) }));

  const result = await contactRepo.importMany(rows, {
    source: req.body.source || "csv",
    createdBy: req.user?.id ?? null,
    mode: req.body.mode || "upsert",
  });

  const parts = [];
  if (result.inserted) parts.push(`${result.inserted} added`);
  if (result.updated) parts.push(`${result.updated} updated`);
  if (result.alreadyCustomers) parts.push(`${result.alreadyCustomers} already customers`);
  if (result.invalid) parts.push(`${result.invalid} bad numbers refused`);
  if (result.skipped) parts.push(`${result.skipped} skipped`);

  res.json({
    success: true,
    message: parts.length ? parts.join(", ") : "Nothing to import",
    data: {
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      invalid: result.invalid,
      alreadyCustomers: result.alreadyCustomers,
    },
  });
});

/**
 * POST /api/contacts/:id/convert — make this lead a customer.
 *
 * The contact row is deliberately left in place. It records where the
 * relationship started — the campaign, the referrer, the event — and the list
 * derives "converted" from the customer existing on the number, so the row
 * reports itself correctly from here on without being edited or deleted.
 */
const convertContact = asyncHandler(async (req, res) => {
  const contact = await contactRepo.findById(req.params.id);
  if (!contact) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }

  const existing = await contactRepo.findCustomerByPhone(contact.phone);
  if (existing) {
    return res.status(200).json({
      success: true,
      message: `${existing.name} is already a customer.`,
      data: { customer: existing, alreadyExisted: true },
    });
  }

  const customer = await customerRepo.create({
    name: contact.name,
    phone: contact.phone,
    email: contact.email || "",
    companyName: contact.companyName || "",
    status: "Active",
    marketingOptOut: contact.marketingOptOut,
  });

  res.status(201).json({
    success: true,
    message: `${customer.name} is now a customer`,
    data: { customer, alreadyExisted: false },
  });
});

module.exports = {
  getContacts,
  getContactTags,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  previewImport,
  importContacts,
  convertContact,
};
