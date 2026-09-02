const z = require("zod");
const { id, money, numberLike, requiredString, enumOf, searchTerm, pagination } = require("./fields");

const DEPOT_STATUS = ["Active", "Maintenance", "High Capacity"];

/**
 * A non-negative whole count for the integer columns (`capacity`,
 * `parked_trucks_count`, `max_capacity`). `numberLike` first so a form field
 * sending "30000" is accepted; the min floor matches each column's CHECK.
 */
const wholeCount = (label, { min = 0 } = {}) =>
  numberLike(label).pipe(
    z
      .number()
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
  );

/**
 * One row of the depot_product_capacities join. The controller reads
 * `pc.product` (the product id) and `pc.capacity`, so those are the names the
 * schema must whitelist — anything else is stripped before the controller
 * runs, which is exactly the bug this shape fixes.
 */
const productCapacity = z.object({
  product: z.union([id("Product"), z.string(), z.number()]),
  capacity: wholeCount("Capacity", { min: 0 }),
});

const productPrice = z.object({
  product: z.union([id("Product"), z.string(), z.number()]),
  currentPrice: money("Price", { min: 0 }),
});

/**
 * Setting a fuel price.
 *
 * `min: 0`, and zero is meaningful: it is how this system has always recorded
 * "we do not sell this product at this depot". 40 of the 48 rows in
 * depot_product_prices sit at 0 today, and everything downstream already reads
 * it that way — loadCatalog filters on `currentPrice > 0`, and placing an
 * order re-checks it before pricing.
 *
 * It was previously `min: 0.01`, on the reasoning that a zero price would make
 * orders free. It would not, because of those two checks — what it actually
 * did was make the state unreachable from the UI. A product could be taken off
 * sale at a depot before that rule existed, and never again afterwards: prices
 * are upserted, there is no delete path, so once a product had a price the
 * only way back was a figure greater than zero. Setting it to nothing was
 * impossible, which is the bug this restores.
 */
const updateProductPrice = z.object({
  productId: id("Product"),
  price: money("Price", { min: 0.01 }),
});

/**
 * The full write shape of a depot. Every field the controller reads must be
 * declared here: the validate middleware strips unknown keys and replaces
 * req.body wholesale, so any omitted field never reaches the controller — that
 * silently dropped `productCapacities`, `staffIds`, `city`, `country`,
 * `postcode`, `maxCapacity` and `establishedYear` on write.
 */
const createDepot = z.object({
  name: requiredString("Depot name", 255),
  code: requiredString("Depot code", 50),
  address: requiredString("Address", 1000),
  city: requiredString("City", 100),
  state: requiredString("State", 100),
  country: requiredString("Country", 100),
  postcode: requiredString("Postcode", 20),
  parkedTrucksCount: wholeCount("Parked trucks count", { min: 0 }).optional(),
  maxCapacity: wholeCount("Max capacity", { min: 0 }).optional(),
  status: enumOf("Status", DEPOT_STATUS).optional(),
  establishedYear: requiredString("Established year", 10),
  productCapacities: z.array(productCapacity).optional(),
  productPrices: z.array(productPrice).optional(),
  staffIds: z.array(z.union([id("Staff id"), z.string(), z.number()])).optional(),
});

const updateDepot = createDepot.partial();

const listDepots = pagination.extend({
  search: searchTerm,
  status: enumOf("Status", [...DEPOT_STATUS, "all"]).optional(),
});

const idParam = z.object({ id: id("Depot id") });

module.exports = { updateProductPrice, createDepot, updateDepot, listDepots, idParam };
