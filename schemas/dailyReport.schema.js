const { z } = require("zod");

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const priceBandSchema = z.object({
  price: z.coerce.number().nonnegative(),
  litres: z.coerce.number().nonnegative(),
});

const REPORT_TYPES = [
  "sales_manager",
  "product_manager",
  "security_gate",
  "commissions",
  "it_compliance",
];

const submitDailyReportSchema = z.object({
  // Which of the five reports this is. Zod strips unknown keys, so without
  // this the field was silently dropped and every report saved as the
  // column default — the type filter then found nothing.
  reportType: z.enum(REPORT_TYPES).optional(),
  // Commission and compliance fields, real columns rather than text packed
  // into remarks.
  customerCount: z.coerce.number().int().nonnegative().optional(),
  orderCount: z.coerce.number().int().nonnegative().optional(),
  rates: z.string().max(500).optional(),
  reportDate: z.string().date(),
  location: z.string().min(1).max(255),
  pfiNumber: z.string().max(50).optional().default(""),
  productName: z.string().max(100).optional(),
  carriedOverLoading: z.coerce.number().nonnegative().optional(),
  openingStock: z.coerce.number().nonnegative().optional(),
  receivedStock: z.coerce.number().nonnegative().optional(),
  litresSold: z.coerce.number().nonnegative().optional(),
  avgPrice: z.coerce.number().nonnegative().optional(),
  priceBands: z.array(priceBandSchema).max(20).optional(),
  tankBalance: z.coerce.number().nonnegative().optional(),
  loadingLeftOver: z.coerce.number().nonnegative().optional(),
  amountPaid: z.coerce.number().nonnegative().optional(),
  differentials: z.coerce.number().optional(),
  truckCount: z.coerce.number().int().nonnegative().optional(),
  // Settling yesterday's gap, and the running bank total for this PFI — both
  // distinct from today's own amountPaid/differentials above.
  yesterdayDeficitPayment: z.coerce.number().nonnegative().optional(),
  yesterdaySurplusPayment: z.coerce.number().nonnegative().optional(),
  totalInflow: z.coerce.number().nonnegative().optional(),
  // Commission report. Nullable rather than defaulted — see the columns'
  // own note in db/schema/dailyReport.js on why 0 and "not filled in" have
  // to stay distinguishable here.
  fundsReceived: z.coerce.number().nonnegative().nullish(),
  commissionDue: z.coerce.number().nonnegative().nullish(),
  // security_gate's other truck count — truckCount above is "exited" for
  // this role, this is "entered".
  trucksEntered: z.coerce.number().int().nonnegative().optional(),
  bankName: z.string().max(255).optional(),
  accountNumber: z.string().max(50).optional(),
  topCustomers: z.array(z.object({
    name: z.string().max(255),
    phone: z.string().max(30).optional().default(""),
    litres: z.coerce.number().nonnegative().optional(),
  })).max(5).optional(),
  remarks: z.string().max(5000).optional(),
});

const amendDailyReportSchema = submitDailyReportSchema.partial();

const reviewDailyReportSchema = z.object({
  approve: z.boolean(),
  comment: z.string().max(2000).optional().default(""),
});

const dailyReportQuerySchema = z.object({
  reportType: z.enum(REPORT_TYPES).optional(),
  page: z.coerce.number().int().positive().default(1),
  // 1000, not 100 — the ceiling the repository itself clamps to, and the one
  // schemas/fields.js#pagination gives every other list.
  //
  // This schema hand-rolls its pagination instead of extending that helper, so
  // when the dashboard moved every list to 1000 rows a page it took this
  // endpoint with it and nothing here followed. The page has been asking for
  // limit=1000 and getting a flat 400 ever since: no reports, for anybody, on
  // a screen whose whole job is showing you what you filed. It reads exactly
  // like empty data, which is how it survived being looked at more than once.
  limit: z.coerce.number().int().positive().max(1000).default(50),
  location: z.string().max(255).optional(),
  status: z.enum(["submitted", "approved", "rejected"]).optional(),
  pfiNumber: z.string().max(50).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  sort: z
    .enum(["reportDate", "location", "createdAt", "totalSalesAmount", "litresSold"])
    .optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

// The Hub's own "Email report" action: whatever workbook the browser just
// built for the current filters, sent to whoever the user types in — not the
// static REPORT_RECIPIENTS list the scheduled script uses.
const emailReportsHubSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(25),
  reportDate: z.string().date(),
  filename: z.string().min(1).max(255),
  // base64 xlsx — Resend's attachment cap is generous, but nobody is
  // building a single day's report anywhere near it.
  attachmentBase64: z.string().min(1),
  reportCount: z.coerce.number().int().nonnegative().optional(),
  location: z.string().max(255).optional(),
  pfi: z.string().max(50).optional(),
});

module.exports = {
  idParamSchema,
  submitDailyReportSchema,
  amendDailyReportSchema,
  reviewDailyReportSchema,
  dailyReportQuerySchema,
  emailReportsHubSchema,
};
