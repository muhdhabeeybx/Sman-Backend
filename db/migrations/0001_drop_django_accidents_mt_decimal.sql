ALTER TABLE "sman"."audit_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."audit_logs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."bank_account_extras" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."commissions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."customer_credits" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."customer_identities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."customer_trusted_devices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."customer_passkeys" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."webauthn_challenges" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."customer_licenses" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."customer_otps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."daily_report_extras" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."dangote_order_requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."dangote_products" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."delivery_notes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."depot_extras" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."depot_price_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."depot_product_capacities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."depot_product_commissions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."depot_staff" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."device_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."drivers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."driver_truck_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."expected_payments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."expense_category_extras" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."truck_extras" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."lpg_station_staff" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."pfi_staff" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."wallet_holds" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."webhook_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."order_deposit_allocations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."order_idempotency" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."vendors" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."pfi_expense_extras" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."pfi_expense_comments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."lpg_station_cylinders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."lpg_price_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."lpg_station_extras" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."lpg_order_requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."staff_page_overrides" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."staff_password_resets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."notifications" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."notification_deliveries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."notification_preferences" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."notification_settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."message_templates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."wa_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."wa_messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sman"."wa_templates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "sman"."audit_events" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."audit_logs" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."bank_account_extras" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."commissions" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."customer_credits" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."customer_identities" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."customer_trusted_devices" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."customer_passkeys" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."webauthn_challenges" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."customer_licenses" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."customer_otps" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."daily_report_extras" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."dangote_order_requests" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."dangote_products" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."delivery_notes" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."depot_extras" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."depot_price_history" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."depot_product_capacities" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."depot_product_commissions" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."depot_staff" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."device_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."drivers" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."driver_truck_history" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."expected_payments" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."expense_category_extras" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."truck_extras" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."sessions" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."lpg_station_staff" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."pfi_staff" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."wallet_holds" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."webhook_events" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."order_deposit_allocations" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."order_idempotency" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."vendors" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."pfi_expense_extras" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."pfi_expense_comments" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."lpg_station_cylinders" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."lpg_price_history" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."lpg_station_extras" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."lpg_order_requests" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."staff_page_overrides" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."staff_password_resets" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."notifications" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."notification_deliveries" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."notification_preferences" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."notification_settings" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."message_templates" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."wa_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."wa_messages" CASCADE;--> statement-breakpoint
DROP TABLE "sman"."wa_templates" CASCADE;--> statement-breakpoint
ALTER TABLE "pfis" ALTER COLUMN "bl_qty_mt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "pfis" ALTER COLUMN "qty_volume_mt" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "pfis" ALTER COLUMN "qty_volume_mt" SET DEFAULT '0';--> statement-breakpoint
DROP TYPE "sman"."driver_status";--> statement-breakpoint
DROP TYPE "sman"."audit_actor_type";--> statement-breakpoint
DROP TYPE "sman"."delivery_customer_type";--> statement-breakpoint
DROP TYPE "sman"."delivery_note_status";--> statement-breakpoint
DROP TYPE "sman"."wallet_hold_status";--> statement-breakpoint
DROP TYPE "sman"."webhook_status";--> statement-breakpoint
DROP TYPE "sman"."customer_identity_provider";--> statement-breakpoint
DROP TYPE "sman"."license_verification_status";--> statement-breakpoint
DROP TYPE "sman"."commission_status";--> statement-breakpoint
DROP TYPE "sman"."principal_type";--> statement-breakpoint
DROP TYPE "sman"."device_token_platform";--> statement-breakpoint
DROP TYPE "sman"."notification_category";--> statement-breakpoint
DROP TYPE "sman"."notification_priority";--> statement-breakpoint
DROP TYPE "sman"."notification_channel";--> statement-breakpoint
DROP TYPE "sman"."notification_delivery_status";--> statement-breakpoint
DROP TYPE "sman"."wa_message_direction";--> statement-breakpoint
DROP TYPE "sman"."wa_message_status";--> statement-breakpoint
DROP TYPE "sman"."wa_session_state";--> statement-breakpoint
DROP TYPE "sman"."wa_template_status";--> statement-breakpoint
DROP SCHEMA "sman";

-- The squashed baseline above was generated while 79 Django-introspected
-- table files (cutover-era leftovers) were still in db/schema/ — it
-- CREATEs them, but the accompanying snapshot never knew them, so no
-- generated migration can remove them. Dropped explicitly here: they are
-- empty on any database built from this journal, and the app has never
-- referenced them.
DROP TABLE IF EXISTS "administration_category" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_confirmrelease" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_dailyreportapproval" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_deliverycustomer" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_deliveryinventory" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_deliveryinventory_trucks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_deliveryledgersettingsaudit" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_deliverysale" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_feedback" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_offlinesales" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_offlinesales_trucks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_offlinesalesproduct" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_record" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_reportrecipient" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_staffdailysalesreport" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_user" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_user_filling_stations" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_user_groups" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_user_locations" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_user_lpg_plants" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_user_pfis" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_user_user_permissions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "administration_usertoken" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "auth_group" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "auth_group_permissions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "auth_permission" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "auth_user" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "auth_user_groups" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "auth_user_user_permissions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "authtoken_token" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_agent" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_auditlog" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_bankacct" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_bankstatement" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_bankstatementcolumnmapping" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_bankstatementline" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_customer" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_deliveryorders" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_depots" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_expensecategory" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_fleetledgerentry" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_fleettruck" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_locationcommissionrate" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_lpgplant" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_lpgsale" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_lpgstockentry" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_order" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_orderauditevent" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_orderpaymentinfo" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_orderpaymentrecord" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_orderproduct" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_overpaymenttransferrequest" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_paymentchannels" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_paymentfile" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_paymentsplit" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_pfi" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_pfi_allowed_locations" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_pfiexpense" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_pfiexpenseattachment" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_pfiexpenseaudit" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_pfimovement" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_pickuporders" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_pickuptruck" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_product" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_productprice" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_states" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_truck" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_truckallocation" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_truckbreakdown" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "consumer_truckticket" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_admin_log" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_celery_beat_clockedschedule" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_celery_beat_crontabschedule" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_celery_beat_intervalschedule" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_celery_beat_periodictask" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_celery_beat_periodictasks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_celery_beat_solarschedule" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_content_type" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_migrations" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "django_session" CASCADE;--> statement-breakpoint
DROP SCHEMA IF EXISTS "sman" CASCADE;

-- The squash also lost the wallet's DB-level backstop (originally migration
-- 0004_balance_non_negative): nothing at the database layer stopped a raw
-- write taking a customer's balance negative. All application writes go
-- through guarded repo code, but the constraint is the last line of defense
-- and tests/money-path.test.js asserts it by name.
ALTER TABLE "customers" ADD CONSTRAINT "customers_balance_non_negative" CHECK (balance >= 0);
