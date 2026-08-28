-- People hygiene, message campaigns, and real delivery receipts.
--
-- Written by hand in the style of 0002–0005 rather than generated, for the
-- reason set out in 0003: drizzle-kit has no snapshot of this database. Every
-- statement is idempotent, so re-running the file is a no-op.
--
-- Three problems, measured on the live book before anything here was written:
--
--   1. 115 of 1,380 customer phone numbers (8.3%) are not valid numbers at
--      all — "0802121", "0000000000", "080355515413". Every one of them
--      consumes an SMS send that can never arrive.
--   2. A broadcast fans out into one delivery row per recipient with nothing
--      tying them together, so "who did we message on Tuesday, and who
--      actually got it?" has no query behind it.
--   3. 852 of 2,230 SMS attempts failed, 346 of them because the Termii
--      wallet was empty — and nobody could see that from the dashboard.

-- ── 1. Customers get the same normalised phone key contacts already have ────
--
-- `customers_phone_idx` is UNIQUE on the RAW string, which means
-- "08012345678" and "+2348012345678" are two different customers as far as
-- the database is concerned. Contacts solved this in 0005 with a generated
-- last-ten-digits column under a unique index; customers get the identical
-- column here so both tables are deduped on the same key and the contact →
-- customer match stops having to normalise the customers side on the fly.
--
-- Deliberately NOT unique yet. There are already duplicate groups on the live
-- book, and a unique index would fail the migration on the one database that
-- matters. They surface in the review panel (GET /api/people/duplicates) to
-- be merged by a human, because a customer row carries orders, deposits and a
-- wallet balance — the wrong one to drop is not a decision a migration gets
-- to make. Once the book is clean, promote this to UNIQUE.
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "phone_normalized" varchar(20)
  GENERATED ALWAYS AS (RIGHT(regexp_replace("phone", '[^0-9]', '', 'g'), 10)) STORED;

CREATE INDEX IF NOT EXISTS "customers_phone_normalized_idx"
  ON "customers" ("phone_normalized");

-- ── 2. Campaigns ───────────────────────────────────────────────────────────
--
-- One row per press of Send. Everything the delivery log could not answer
-- lives here: what was written, who it was aimed at, what it cost, and what
-- the SMS wallet stood at either side of it.
--
-- The body is stored RESOLVED — what recipients actually received, not the
-- "{{prices}}" that was typed. A campaign is a record of what went out; the
-- template is where the shortcode belongs.
CREATE TABLE IF NOT EXISTS "message_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" varchar(255) DEFAULT '' NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  -- 'email', 'sms', or both.
  "channels" text[] DEFAULT '{}'::text[] NOT NULL,
  -- The preset id the sender picked ("everyone", "leads", "frequent"), plus
  -- the sentence describing what it meant AT THE TIME. The definition of
  -- "frequent customers" is tunable on the page, so storing only the id would
  -- leave a campaign whose audience cannot be reconstructed six months later.
  "audience" varchar(64) DEFAULT '' NOT NULL,
  "audience_label" varchar(255) DEFAULT '' NOT NULL,
  "recipient_count" integer DEFAULT 0 NOT NULL,
  -- Per recipient, on the resolved text. recipient_count × sms_segments is
  -- what the blast was expected to cost in Termii units.
  "sms_segments" integer DEFAULT 0 NOT NULL,
  -- The Termii wallet either side of the send. Read before and after rather
  -- than computed, because Termii is the authority on its own billing and a
  -- computed estimate would silently diverge from the invoice.
  "balance_before" numeric(15, 2),
  "balance_after" numeric(15, 2),
  "balance_currency" varchar(10) DEFAULT '' NOT NULL,
  "sent_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

-- SET NULL, not CASCADE: removing a staff member must not delete the record
-- of the messages they sent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_campaigns_sent_by_fkey') THEN
    ALTER TABLE "message_campaigns" ADD CONSTRAINT "message_campaigns_sent_by_fkey"
      FOREIGN KEY ("sent_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "message_campaigns_created_at_idx"
  ON "message_campaigns" ("created_at" DESC);

-- ── 3. Delivery rows learn who, which campaign, and whether it landed ───────
ALTER TABLE "notification_deliveries"
  -- SET NULL rather than CASCADE. The retention sweep purges campaigns long
  -- before it purges the log, and a delivery row that has lost its campaign is
  -- still the answer to "was this customer ever told?".
  ADD COLUMN IF NOT EXISTS "campaign_id" integer,
  -- Who it went to, in words. The table already carries staff_id/customer_id,
  -- but a broadcast to leads has NO principal behind it at all — a contact is
  -- addressed by their details — so the log could only ever show a bare phone
  -- number. Denormalised on purpose: this is an audit log, and the name as it
  -- stood when the message went out is the truthful answer, not whatever the
  -- record was renamed to afterwards.
  ADD COLUMN IF NOT EXISTS "recipient_name" varchar(255) DEFAULT '' NOT NULL,
  -- Termii's own word for what happened, verbatim ("DELIVERED", "Rejected",
  -- "Expired"). Kept beside our own `status` rather than mapped into it,
  -- because the provider's vocabulary is finer than our six values and the
  -- distinction between "the handset never came online" and "the network
  -- refused it" is exactly what a support question turns on.
  ADD COLUMN IF NOT EXISTS "provider_status" varchar(64) DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_deliveries_campaign_id_fkey') THEN
    ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_campaign_id_fkey"
      FOREIGN KEY ("campaign_id") REFERENCES "public"."message_campaigns"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "notification_deliveries_campaign_idx"
  ON "notification_deliveries" ("campaign_id", "created_at" DESC);

-- The delivery-receipt lookup: a Termii callback arrives carrying only its own
-- message id, and has to find the row it belongs to. Partial, because all but
-- a handful of rows have no provider id — push, email and every SMS sent
-- before the id was captured — and indexing those is dead weight.
CREATE INDEX IF NOT EXISTS "notification_deliveries_provider_message_idx"
  ON "notification_deliveries" ("provider_message_id")
  WHERE "provider_message_id" <> '';
