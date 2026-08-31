-- One customer, several numbers — every one of them a way into the account.
--
-- Written by hand in the style of 0002–0005 and 0016 rather than generated,
-- for the reason set out in 0003: drizzle-kit has no snapshot of this
-- database. Every statement is idempotent, so re-running the file is a no-op.
--
-- ── The problem ────────────────────────────────────────────────────────────
--
-- `customers.phone` is one column, so a customer is one number. That is not
-- how the book actually works: a company buys under the manager's line and
-- the director's, a trader changes SIM and keeps both, a depot officer calls
-- from whichever handset is charged. Today each of those is a SEPARATE
-- customer row — which is precisely where the duplicate groups the hygiene
-- panel surfaces come from — and only one of them can sign in to the wallet
-- and the order history the business actually holds for that person.
--
-- ── Why a second table and not phone2/phone3 ───────────────────────────────
--
-- Extra columns cap the count, cannot be indexed usefully for "who owns this
-- number?", and give nowhere to record which numbers have been PROVEN. Rows
-- do all three. The lookup that matters — a login arriving as ten digits —
-- becomes one indexed probe rather than a scan across three columns.
--
-- ── The primary stays on customers.phone ───────────────────────────────────
--
-- This table holds the ALTERNATES only. Moving the primary in here as well
-- would mean every one of the ~200 existing reads of `customers.phone` — the
-- SMS senders, the Paystack DVA name, the segment resolution, the CSV export,
-- three separate order flows — either changes or reads a mirror that is free
-- to drift from its source. Instead there is exactly one primary, in the
-- place everything already looks for it, and the alternates live beside it.
-- "Make this the primary" is a swap between the two, not a flag.

CREATE TABLE IF NOT EXISTS "customer_phones" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL,
  "phone" varchar(30) NOT NULL,
  -- Last ten digits, generated and STORED, exactly as customers.phone_
  -- normalized and contacts.phone_normalized are. The same person is written
  -- "08012345678", "+2348012345678" and "0801-234-5678" by three different
  -- people; the last ten digits are what identifies the subscriber, and this
  -- is the key the login lookup runs on.
  "phone_normalized" varchar(20)
    GENERATED ALWAYS AS (RIGHT(regexp_replace("phone", '[^0-9]', '', 'g'), 10)) STORED,
  -- What this number IS, in the desk's words — "Warehouse", "Director",
  -- "Old MTN line". Free text because the useful labels are the customer's,
  -- not a list we can enumerate in advance.
  "label" varchar(60) DEFAULT '' NOT NULL,
  -- Set when someone has proven control of this number by passing an OTP on
  -- it. Null means the desk typed it in and nobody has answered on it yet —
  -- which is still enough to sign in, because signing in IS the proof: the
  -- code goes to the number being claimed, and verify-otp stamps this.
  "verified_at" timestamp with time zone,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- CASCADE on the customer: an alternate number is part of the customer
-- record, not something that outlives it. SET NULL on the staff member:
-- removing whoever added a number must not remove the number.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_phones_customer_id_fkey') THEN
    ALTER TABLE "customer_phones" ADD CONSTRAINT "customer_phones_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_phones_created_by_fkey') THEN
    ALTER TABLE "customer_phones" ADD CONSTRAINT "customer_phones_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- UNIQUE, and unique here is affordable in a way it was not on `customers`
-- (see 0016): this table starts empty, so there is no existing duplicate to
-- fail the migration on, and a row carries no orders or balance — the wrong
-- one to reject costs a retype, not a ledger.
--
-- What this index CANNOT enforce is the other half of the rule: an alternate
-- must not collide with another customer's PRIMARY either, and that lives in
-- a different table. Postgres has no cross-table unique constraint, so the
-- check is in customerPhone.repository#findOwner and runs on every add. It is
-- one indexed probe against customers.phone_normalized, which 0016 indexed.
CREATE UNIQUE INDEX IF NOT EXISTS "customer_phones_normalized_idx"
  ON "customer_phones" ("phone_normalized");

CREATE INDEX IF NOT EXISTS "customer_phones_customer_idx"
  ON "customer_phones" ("customer_id");
