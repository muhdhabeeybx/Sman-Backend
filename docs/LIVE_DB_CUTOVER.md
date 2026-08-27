# Pointing Sman-Backend at the live `soroman_db`

**Status:** Blocked on schema work — this is *not* a connection-string swap.
**Authoritative schema reference:** [`live_schema.sql`](./live_schema.sql) (pg_dump, schema-only, captured 2026-08-17).

---

## 0. Read this first

The live database is owned and migrated by the **Django** app (`soroman_backend-2`).
Sman-Backend's Drizzle layer was designed clean-room against a *different* database
(`soroman_dashboard` on Neon). The two schemas share **zero table names**.

| | Live `soroman_db` | Sman-Backend Drizzle |
|---|---|---|
| Tables | 81 (64 business + 17 Django/auth internals) | 36 |
| Tables in common | **0** | **0** |
| Postgres enums | **0** (Django uses `varchar` + app-level choices) | 28 `pgEnum`s |
| Primary keys | `bigint` identity (Django default) | `serial` (`integer`) |
| Migration owner | Django `django_migrations` | Drizzle `db/migrations` |
| Password hashing | `pbkdf2_sha256$...` (Django default) | `bcrypt` |

If you deploy as-is, **every repository query fails immediately** — `orders`,
`customers`, `pfis` etc. do not exist in `soroman_db`.

---

## 1. Connection details

Server: **PostgreSQL 15.12** (Amazon Linux), `35.180.19.138:5432`, database `soroman_db`, user `soroman_user`.

Copy the value verbatim from `soroman_backend-2/.env` line 7:

```bash
DATABASE_URL=postgresql://soroman_user:<password>@35.180.19.138:5432/soroman_db
```

Notes that matter:

- **No `sslmode` parameter.** Django connects with `ssl_require=False`, and
  `db/index.js` calls `postgres(connectionString)` with no SSL options — so the URL
  works as-is. Do **not** append `?sslmode=require` (the `.env.example` Neon sample
  has it; that sample does not apply here).
- Django holds connections with `conn_max_age=600`. Set a conservative
  `postgres(url, { max: 10 })` pool ceiling so the two apps don't exhaust server slots.
- `db/index.js` logs `"Neon PostgreSQL connected successfully"` — stale message, worth
  correcting so nobody thinks they're on Neon.

---

## 2. Guardrails — do not run these against `soroman_db`

`soroman_user` **has CREATE privilege** on this database. Nothing stops a stray command
from writing to production.

```
npm run db:push       ❌ creates 36 shadow tables + 28 enums inside production
npm run db:migrate    ❌ replays db/migrations/0000..0006 into production
npm run db:generate   ❌ diffs against production, produces destructive migrations
```

Recommended before anyone touches this: remove or rename those four scripts in
`package.json`, or gate them on `NODE_ENV !== "production"`. Django's
`django_migrations` table is the single source of truth for this schema; Drizzle must be
a **read/write consumer of an existing schema**, never its migrator.

Also delete or quarantine `db/migrations/` for this target — Drizzle's `_journal.json`
describes a schema that does not exist here.

---

## 3. Table mapping — Drizzle → live Django

Confidence is my read from column shapes, not a verified field-by-field match. Anything
below `high` needs a human to confirm before code depends on it.

| Drizzle table | Live table | Live cols | Confidence |
|---|---|---|---|
| `orders` | `consumer_order` | 74 | high |
| `customers` | `consumer_customer` | 7 | high |
| `pfis` | `consumer_pfi` | 36 | high |
| `products` | `consumer_product` | 10 | high |
| `depots` | `consumer_depots` | 3 | high |
| `trucks` | `consumer_truck` | 4 | high |
| `fleet_trucks` | `consumer_fleettruck` | 30 | high |
| `fleet_ledger_entries` | `consumer_fleetledgerentry` | 10 | high |
| `audit_logs` | `consumer_auditlog` | 11 | high |
| `audit_events` | `consumer_orderauditevent` | 9 | high |
| `staff` | `administration_user` | 22 | high |
| `delivery_customers` | `administration_deliverycustomer` | 20 | high |
| `delivery_inventory` | `administration_deliveryinventory` | 27 | high |
| `delivery_sales` | `administration_deliverysale` | 25 | high |
| `offline_sales` | `administration_offlinesales` | 8 | high |
| `offline_sale_items` | `administration_offlinesalesproduct` | 4 | high |
| `tickets` | `consumer_truckticket` | 18 | high |
| `daily_reports` | `administration_staffdailysalesreport` | 22 | medium |
| `order_trucks` | `consumer_truckallocation` | 11 | medium |
| `depot_product_prices` | `consumer_productprice` | 8 | medium |
| `incident_records` | `consumer_truckbreakdown` | 7 | low |
| `delivery_notes` | `consumer_deliveryorders` | 6 | low |
| `deposits` | `consumer_orderpaymentrecord` | 14 | low |
| `sessions` | `django_session` / `administration_usertoken` | 3 / 6 | low |

### Column shape is the real work

Matching the table name is the easy half. Example — `customers`:

- **Drizzle** declares 18 columns including `status`, `balance`, `deposit`,
  `previous_deposit`, `paystack_customer_id`, `virtual_account_*`, `phone_verified_at`,
  `last_login_at`, `updated_at`.
- **Live `consumer_customer`** has 7: `id`, `first_name`, `last_name`, `company_name`,
  `email`, `phone_number`, `created_at`.

There is no `balance`, no `status`, no wallet. The virtual-account fields live on
`consumer_order` instead. Any service reading `customers.balance` has no backing column.
Expect this class of gap on most of the 24 rows above.

---

## 4. Drizzle tables with no live counterpart (12)

These have nowhere to read from — the features are Sman-Backend-only:

`customer_identities`, `customer_otps`, `customer_passkeys`, `customer_trusted_devices`,
`webauthn_challenges`, `webhook_events`, `wallet_holds`, `drivers`, `depot_staff`,
`depot_price_history`, `depot_product_capacities`, `driver_truck_history`

Notes:
- **`drivers`** — the live DB has no driver table. Driver identity is denormalised onto
  `consumer_fleettruck` (`driver_name`, `driver_phone`, `spare_driver_*`, `motor_boy_*`)
  and `consumer_truckticket` (`driver_name`, `driver_phone`, `entry_driver_*`).
- **The customer-auth stack** (identities/OTP/passkeys/trusted devices/WebAuthn) has no
  Django equivalent. Django uses `administration_usertoken` and `authtoken_token`.

**Decision needed:** these either (a) get created in a *separate* schema/database that
Sman-Backend owns, or (b) get dropped from the app. Do **not** create them in `public`
alongside Django's tables — that's exactly the mixup to avoid. Option (a) with a
dedicated `sman` schema is the clean route:

```sql
CREATE SCHEMA sman;  -- Sman-Backend owns everything in here; Django owns public
```

---

## 5. Live tables with no Drizzle coverage (41)

Real business data the Node app currently cannot see. Most of the finance stack is here:

**Payments / banking:** `consumer_bankacct`, `consumer_bankstatement`,
`consumer_bankstatementline`, `consumer_bankstatementcolumnmapping`,
`consumer_paymentsplit`, `consumer_paymentfile`, `consumer_paymentchannels`,
`consumer_orderpaymentinfo`, `consumer_overpaymenttransferrequest`

**PFI:** `consumer_pfiexpense`, `consumer_pfiexpenseattachment`, `consumer_pfiexpenseaudit`,
`consumer_pfimovement`, `consumer_pfi_allowed_locations`, `consumer_expensecategory`

**LPG:** `consumer_lpgplant`, `consumer_lpgsale`, `consumer_lpgstockentry`

**Orders / logistics:** `consumer_orderproduct`, `consumer_pickuporders`,
`consumer_pickuptruck`, `consumer_states`, `consumer_agent`,
`consumer_locationcommissionrate`

**Delivery / reporting:** `administration_confirmrelease`, `administration_record`,
`administration_dailyreportapproval`, `administration_deliveryledgersettingsaudit`,
`administration_reportrecipient`, `administration_feedback`, `administration_category`,
`delivery_ledger_settings`, `administration_deliveryinventory_trucks`,
`administration_offlinesales_trucks`, `administration_usertoken`

**Django M2M join tables:** `administration_user_groups`, `administration_user_locations`,
`administration_user_pfis`, `administration_user_filling_stations`,
`administration_user_lpg_plants`, `administration_user_user_permissions`

⚠️ `consumer_orderproduct` (7,019 rows, 1:1 with `consumer_order`) holds order line items.
Drizzle's `orders` table has `product_id`/`quantity` inline — so the live line-item model
is one level deeper than the Drizzle model assumes.

---

## 6. Django conventions the Drizzle layer must respect

1. **Table naming:** `<app>_<modelname>`, lowercased, no underscores inside the model name
   (`consumer_orderpaymentrecord`, not `consumer_order_payment_record`).
2. **Primary keys:** `bigint GENERATED BY DEFAULT AS IDENTITY`. Use Drizzle's
   `bigserial(...,{ mode: "number" })` or `bigint`, **not** `serial`.
3. **Foreign keys:** named `<field>_id`, and Django creates them `DEFERRABLE INITIALLY DEFERRED`.
4. **No enums.** Every `status` / `type` column is `varchar` with choices enforced in
   Python. Replace all 28 `pgEnum` declarations with `varchar` + a Zod check, or writes
   will fail on values Django uses but your enum doesn't list.
5. **Many-to-many** goes through join tables (`administration_user_pfis` etc.), not arrays.
6. **Timestamps** are `timestamp with time zone`; Django writes UTC. The `PgTimestamp`
   patch in `db/index.js` maps to `toISOString()` — verify it round-trips against `timestamptz`.
7. **Passwords:** `administration_user.password` is `pbkdf2_sha256$<iterations>$<salt>$<hash>`.
   `bcrypt.compare()` will **never** match it. Staff login needs a PBKDF2 verifier
   (Node's `crypto.pbkdf2` reproduces Django's format) — or an explicit
   verify-then-rehash migration path.

---

## 7. Suggested order of work

1. **Freeze the destructive paths** — strip `db:push` / `db:migrate` / `db:generate`
   from `package.json`; quarantine `db/migrations/`.
2. **Point at the DB read-only first.** Create a read-only role, prove the app boots and
   `SELECT 1` succeeds before any write path is enabled.
3. **Regenerate the schema from truth:** `npx drizzle-kit introspect` against `soroman_db`
   into a scratch folder, or hand-write from [`live_schema.sql`](./live_schema.sql).
   Do not hand-edit the existing `db/schema/*.js` — replace them.
4. **Decide on the 12 orphan tables** (§4) — separate `sman` schema, or cut the features.
5. **Rewrite repositories** in `repositories/` against the new table/column names. This is
   the bulk of the effort — 26 repository files (plus the 26 services that consume them)
   currently assume the clean-room schema.
6. **Fix staff auth** to PBKDF2 (§6.7).
7. **Run the test suite against a restored copy**, never against `soroman_db`.

### Making a safe test copy

```bash
# schema + data into a local scratch DB — never test against production
pg_dump "$LIVE_DATABASE_URL" --no-owner --no-privileges -Fc -f soroman_full.dump
createdb soroman_test
pg_restore -d soroman_test --no-owner --no-privileges soroman_full.dump
```

---

## 8. Row counts (largest tables, at capture time)

Useful for sanity-checking that you're on the right database:

| Table | Rows |
|---|---|
| `administration_deliveryledgersettingsaudit` | 29,066 |
| `consumer_auditlog` | 14,951 |
| `consumer_customer` | 7,636 |
| `consumer_order` | 7,019 |
| `consumer_orderproduct` | 7,019 |
| `consumer_orderpaymentinfo` | 6,813 |
| `consumer_pickuporders` | 6,674 |
| `consumer_truckticket` | 5,487 |
| `consumer_pfimovement` | 4,390 |
| `consumer_orderpaymentrecord` | 3,937 |
| `consumer_truckallocation` | 3,916 |

Django migration state at capture: `administration` at `0058_alter_user_role_alter_user_roles`,
`consumer` at `0094_pfi_credit_balance`.
