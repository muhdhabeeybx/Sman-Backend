-- Contacts: the people who are not customers yet.
--
-- A lead has a name and a number and nothing else — no wallet, no balance,
-- no DVA, no order history. Putting them in `customers` with a "Lead" status
-- would have been less work and considerably worse: every customer count,
-- balance sum, wallet sweep, finance query and messaging segment already
-- reads that table and would silently start including people who have never
-- bought anything. They get their own table instead.
--
-- Written by hand in the style of 0002–0004 rather than generated, for the
-- reason set out in 0003: drizzle-kit has no snapshot of this database.
-- Every statement is idempotent, so re-running the file is a no-op.
--
-- ── Conversion is derived, not stored ──────────────────────────────────────
--
-- There is no converted_customer_id column. A contact becomes a customer the
-- moment a customer exists on the same phone number, and that is a fact the
-- customers table already holds — storing it here as well would create a
-- second copy that goes stale the first time someone is added to customers
-- by any of the several paths that do so (desk, WhatsApp, self-signup) and
-- never thinks to update a contacts row. The list query joins on the
-- normalised number and reports the match, so it is always current and
-- nothing has to hook the order flow.
--
-- ── Why phone_normalized ───────────────────────────────────────────────────
--
-- The same person is written "08012345678", "+2348012345678",
-- "234 801 234 5678" and "0801-234-5678" depending on who typed it. The last
-- ten digits are what actually identify a Nigerian subscriber, so that is the
-- key uniqueness and the customer match both run on. Generated and STORED,
-- so it cannot drift from `phone`, and both inputs to it are immutable.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_stage') THEN
    CREATE TYPE "public"."contact_stage" AS ENUM ('lead', 'contact');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_source') THEN
    CREATE TYPE "public"."contact_source" AS ENUM ('manual', 'csv', 'referral', 'event', 'other');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" serial PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "phone" varchar(30) NOT NULL,
  "phone_normalized" varchar(20)
    GENERATED ALWAYS AS (RIGHT(regexp_replace("phone", '[^0-9]', '', 'g'), 10)) STORED,
  "email" varchar(255) DEFAULT '' NOT NULL,
  "company_name" varchar(255) DEFAULT '' NOT NULL,
  -- 'lead' is someone we want to sell to; 'contact' is anyone else worth
  -- keeping a number for (a haulier, a depot officer, a referrer). Both are
  -- messageable; only the first is a sales prospect.
  "stage" "public"."contact_stage" DEFAULT 'lead' NOT NULL,
  "source" "public"."contact_source" DEFAULT 'manual' NOT NULL,
  "location_id" integer,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  -- Mirrors customers.marketing_opt_out and is honoured by the same segment
  -- resolution, so "do not contact me" means the same thing on both tables.
  "marketing_opt_out" boolean DEFAULT false NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- SET NULL, not CASCADE: closing a depot or removing a staff member must not
-- delete the contacts recorded against them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_location_id_fkey') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_location_id_fkey"
      FOREIGN KEY ("location_id") REFERENCES "public"."depots"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_created_by_fkey') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Unique on the normalised number, not the raw one: a CSV re-uploaded with
-- "+234…" where the first upload had "0…" is the same people, and the import
-- relies on this to update them rather than double them.
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_phone_normalized_idx" ON "contacts" ("phone_normalized");
CREATE INDEX IF NOT EXISTS "contacts_stage_idx" ON "contacts" ("stage");
CREATE INDEX IF NOT EXISTS "contacts_location_idx" ON "contacts" ("location_id");
CREATE INDEX IF NOT EXISTS "contacts_created_at_idx" ON "contacts" ("created_at");
