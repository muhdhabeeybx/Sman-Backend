CREATE SCHEMA "sman";
--> statement-breakpoint
CREATE TYPE "public"."statement_line_status" AS ENUM('UNMATCHED', 'MATCHED');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('Active', 'Inactive', 'Pending');--> statement-breakpoint
CREATE TYPE "public"."principal_type" AS ENUM('staff', 'customer');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('staff', 'customer', 'system');--> statement-breakpoint
CREATE TYPE "public"."order_truck_status" AS ENUM('pending', 'gated_in', 'loaded', 'gated_out');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('Active', 'On Trip', 'Off Duty');--> statement-breakpoint
CREATE TYPE "public"."truck_status" AS ENUM('In Transit', 'Idle', 'Maintenance');--> statement-breakpoint
CREATE TYPE "public"."depot_status" AS ENUM('Active', 'Maintenance', 'High Capacity');--> statement-breakpoint
CREATE TYPE "public"."order_delivery_type" AS ENUM('delivery', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('Unpaid', 'Paid');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('Pending', 'Paid', 'Released', 'Loading', 'Completed', 'Cancelled', 'Expired');--> statement-breakpoint
CREATE TYPE "public"."pfi_status" AS ENUM('active', 'finished');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('pending', 'verified', 'audit_approved', 'admin_approved', 'paid', 'rejected', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('sales_manager', 'product_manager', 'security_gate', 'commissions', 'it_compliance');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('Active', 'Redeemed');--> statement-breakpoint
CREATE TYPE "public"."deposit_type" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."wallet_hold_status" AS ENUM('active', 'converted', 'released');--> statement-breakpoint
CREATE TYPE "public"."delivery_customer_type" AS ENUM('customer', 'filling_station', 'third_party', 'bulk', 'retail', 'wholesale', 'corporate', 'government', 'other');--> statement-breakpoint
CREATE TYPE "public"."delivery_customer_status" AS ENUM('active', 'dormant', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."delivery_note_status" AS ENUM('Pending', 'In Transit', 'Delivered', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."loading_status" AS ENUM('loaded', 'offloaded', 'empty');--> statement-breakpoint
CREATE TYPE "public"."deposit_status_enum" AS ENUM('pending', 'paid', 'partial');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('manual', 'paystack_dva');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."fleet_entry_type" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."customer_identity_provider" AS ENUM('email', 'google', 'apple', 'pin');--> statement-breakpoint
CREATE TYPE "public"."daily_report_status" AS ENUM('submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('incident', 'expense', 'maintenance', 'observation', 'compliance');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('submitted', 'reviewed', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."offline_sale_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('pending', 'confirmed', 'released');--> statement-breakpoint
CREATE TYPE "public"."customer_created_via" AS ENUM('desk', 'portal', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."wa_session_state" AS ENUM('IDENTIFY', 'MENU', 'DEPOT', 'PRODUCT', 'QUANTITY', 'COMPANY', 'COLLECT', 'LOGISTICS', 'CONFIRM', 'AWAIT_PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."wa_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."wa_message_status" AS ENUM('received', 'processed', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."wa_template_status" AS ENUM('pending', 'approved', 'rejected', 'paused');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."license_verification_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'push', 'email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('orders', 'payments', 'delivery', 'tickets', 'account', 'security', 'reports', 'operations', 'marketing', 'system');--> statement-breakpoint
CREATE TYPE "public"."device_token_platform" AS ENUM('android', 'ios', 'web');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'sent', 'delivered', 'failed', 'skipped', 'suppressed');--> statement-breakpoint
CREATE TYPE "sman"."driver_status" AS ENUM('Active', 'On Trip', 'Off Duty');--> statement-breakpoint
CREATE TYPE "sman"."audit_actor_type" AS ENUM('staff', 'customer', 'system');--> statement-breakpoint
CREATE TYPE "sman"."delivery_customer_type" AS ENUM('customer', 'filling_station');--> statement-breakpoint
CREATE TYPE "sman"."delivery_note_status" AS ENUM('Pending', 'In Transit', 'Delivered', 'Cancelled');--> statement-breakpoint
CREATE TYPE "sman"."wallet_hold_status" AS ENUM('active', 'converted', 'released');--> statement-breakpoint
CREATE TYPE "sman"."webhook_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "sman"."customer_identity_provider" AS ENUM('email', 'google', 'apple', 'pin');--> statement-breakpoint
CREATE TYPE "sman"."license_verification_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "sman"."commission_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "sman"."principal_type" AS ENUM('staff', 'customer');--> statement-breakpoint
CREATE TYPE "sman"."device_token_platform" AS ENUM('android', 'ios', 'web');--> statement-breakpoint
CREATE TYPE "sman"."notification_category" AS ENUM('orders', 'payments', 'delivery', 'tickets', 'account', 'security', 'reports', 'operations', 'marketing', 'system');--> statement-breakpoint
CREATE TYPE "sman"."notification_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "sman"."notification_channel" AS ENUM('in_app', 'push', 'email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "sman"."notification_delivery_status" AS ENUM('pending', 'sent', 'delivered', 'failed', 'skipped', 'suppressed');--> statement-breakpoint
CREATE TYPE "sman"."wa_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "sman"."wa_message_status" AS ENUM('received', 'processed', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "sman"."wa_session_state" AS ENUM('IDENTIFY', 'MENU', 'DEPOT', 'PRODUCT', 'QUANTITY', 'COMPANY', 'COLLECT', 'LOGISTICS', 'CONFIRM', 'AWAIT_PAYMENT');--> statement-breakpoint
CREATE TYPE "sman"."wa_template_status" AS ENUM('pending', 'approved', 'rejected', 'paused');--> statement-breakpoint
CREATE TABLE "administration_category" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(30) NOT NULL,
	"description" varchar(500),
	CONSTRAINT "administration_category_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "administration_confirmrelease" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_confirmrelease_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"status" varchar(20) NOT NULL,
	"confirmed_by" varchar(255) NOT NULL,
	"confirmed_at" timestamp with time zone,
	"rejection_reason" text NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"inventory_id" bigint,
	"order_id" bigint,
	"source_type" varchar(20) NOT NULL,
	CONSTRAINT "administration_confirmrelease_inventory_id_key" UNIQUE("inventory_id")
);
--> statement-breakpoint
CREATE TABLE "administration_dailyreportapproval" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_dailyreportapproval_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"approved" boolean NOT NULL,
	"approved_at" timestamp with time zone,
	"sent" boolean NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_log" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"approved_by_id" bigint,
	CONSTRAINT "administration_dailyreportapproval_date_key" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "administration_deliverycustomer" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_deliverycustomer_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_name" varchar(255) NOT NULL,
	"phone_number" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"outstanding_limit" numeric(15, 2) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"alt_phone_number" varchar(30) NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"contact_person" varchar(255) NOT NULL,
	"email" varchar(254) NOT NULL,
	"home_address" text NOT NULL,
	"notes" text NOT NULL,
	"office_address" text NOT NULL,
	"passport_photo" varchar(100),
	"contact_person_phone" varchar(50) NOT NULL,
	"last_order_date" date,
	"customer_type" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "administration_deliveryinventory" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_deliveryinventory_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"quantity_allocated" numeric(15, 2) NOT NULL,
	"date_allocated" date,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"pfi_id" bigint,
	"created_by" varchar(255) NOT NULL,
	"customer_id" bigint,
	"customer_name" varchar(255) NOT NULL,
	"date_offloaded" date,
	"depot" varchar(255) NOT NULL,
	"loading_status" varchar(20) NOT NULL,
	"truck_id" bigint,
	"truck_number" varchar(100) NOT NULL,
	"location" varchar(255) NOT NULL,
	"offloaded_by" varchar(255) NOT NULL,
	"release_status" varchar(20) NOT NULL,
	"ticket_generated_at" timestamp with time zone,
	"ticket_number" varchar(100) NOT NULL,
	"ticket_generated_by" varchar(255) NOT NULL,
	"is_fully_paid" boolean NOT NULL,
	"allocation_code" varchar(64),
	"pfi_number" varchar(50),
	"pfi_product" varchar(100),
	"collection_accounts" jsonb,
	"remittance_accounts" jsonb
);
--> statement-breakpoint
CREATE TABLE "administration_deliveryinventory_trucks" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_deliveryinventory_trucks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"deliveryinventory_id" bigint NOT NULL,
	"fleettruck_id" bigint NOT NULL,
	CONSTRAINT "administration_deliveryi_deliveryinventory_id_fle_48f19848_uniq" UNIQUE("deliveryinventory_id","fleettruck_id")
);
--> statement-breakpoint
CREATE TABLE "administration_deliveryledgersettingsaudit" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_deliveryledgersettingsaudit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"previous_data" jsonb NOT NULL,
	"new_data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"settings_obj_id" bigint NOT NULL,
	"updated_by_id" bigint
);
--> statement-breakpoint
CREATE TABLE "administration_deliverysale" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_deliverysale_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"truck_number" varchar(100) NOT NULL,
	"date_loaded" date NOT NULL,
	"depot_loaded" varchar(255) NOT NULL,
	"location" varchar(255) NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"rate" numeric(12, 2) NOT NULL,
	"sales_value" numeric(14, 2) NOT NULL,
	"payment_amount" numeric(14, 2) NOT NULL,
	"payer_name" varchar(255) NOT NULL,
	"bank" varchar(500) NOT NULL,
	"date_of_payment" date,
	"phone_number" varchar(50) NOT NULL,
	"remarks" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"customer_id" bigint,
	"customer_name" varchar(255) NOT NULL,
	"entered_by" varchar(255) NOT NULL,
	"rates" jsonb,
	"allocation_code" varchar(64),
	"expenses_amount" numeric(14, 2) NOT NULL,
	"deposit_status" varchar(20) NOT NULL,
	"collection_accounts" jsonb,
	"remittance_accounts" jsonb
);
--> statement-breakpoint
CREATE TABLE "administration_feedback" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_feedback_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"email" varchar(254) NOT NULL,
	"phone" varchar(50),
	"company" varchar(255),
	"category" varchar(100) NOT NULL,
	"rating" smallint NOT NULL,
	"message" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"staff_response" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "administration_feedback_rating_check" CHECK (rating >= 0)
);
--> statement-breakpoint
CREATE TABLE "administration_offlinesales" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_offlinesales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"staff" varchar(70) NOT NULL,
	"status" varchar(50) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"notes" text,
	"state_id" bigint
);
--> statement-breakpoint
CREATE TABLE "administration_offlinesalesproduct" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_offlinesalesproduct_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"quantity" integer NOT NULL,
	"offline_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	CONSTRAINT "administration_offlinesa_offline_id_product_id_d88292d1_uniq" UNIQUE("offline_id","product_id"),
	CONSTRAINT "administration_offlinesalesproduct_quantity_check" CHECK (quantity >= 0)
);
--> statement-breakpoint
CREATE TABLE "administration_offlinesales_trucks" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_offlinesales_trucks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"offlinesales_id" bigint NOT NULL,
	"truck_id" bigint NOT NULL,
	CONSTRAINT "administration_offlinesa_offlinesales_id_truck_id_ec9ed983_uniq" UNIQUE("offlinesales_id","truck_id")
);
--> statement-breakpoint
CREATE TABLE "administration_record" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_record_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"category" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(15, 2),
	"status" varchar(10) NOT NULL,
	"extra" jsonb NOT NULL,
	"file" varchar(100),
	"submitted_by_name" varchar(255) NOT NULL,
	"pfi_id" integer,
	"pfi_number" varchar(100) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"submitted_by_id" bigint,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" bigint,
	"reviewed_by_name" varchar(255) NOT NULL,
	"status_note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "administration_reportrecipient" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_reportrecipient_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" varchar(254) NOT NULL,
	"name" varchar(150) NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "administration_reportrecipient_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "administration_staffdailysalesreport" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_staffdailysalesreport_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"location" varchar(255) NOT NULL,
	"submitted_by_name" varchar(255) NOT NULL,
	"yesterday_carried_over_loading" numeric(15, 2),
	"product_brought_forward" numeric(15, 2),
	"litres_sold_today" numeric(15, 2) NOT NULL,
	"price" numeric(12, 2),
	"tank_balance" numeric(15, 2),
	"num_trucks_sold" integer NOT NULL,
	"amount_paid" numeric(15, 2) NOT NULL,
	"total_sales_amount" numeric(15, 2) NOT NULL,
	"differentials" numeric(15, 2),
	"loading_left_over" numeric(15, 2),
	"remarks" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"submitted_by_id" bigint,
	"pfi_number" varchar(50) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"price_bands" jsonb NOT NULL,
	CONSTRAINT "administration_staffdail_date_location_pfi_number_b4528ab5_uniq" UNIQUE("date","location","submitted_by_id","pfi_number"),
	CONSTRAINT "administration_staffdailysalesreport_num_trucks_sold_check" CHECK (num_trucks_sold >= 0)
);
--> statement-breakpoint
CREATE TABLE "administration_user" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"password" varchar(128) NOT NULL,
	"is_superuser" boolean NOT NULL,
	"is_staff" boolean NOT NULL,
	"is_active" boolean NOT NULL,
	"date_joined" timestamp with time zone NOT NULL,
	"username" varchar(150),
	"full_name" varchar(200) NOT NULL,
	"email" varchar(150) NOT NULL,
	"phone_number" varchar(11),
	"device_token" varchar(255),
	"email_verified" boolean NOT NULL,
	"photo" varchar(100),
	"suspended" boolean NOT NULL,
	"last_login" timestamp with time zone NOT NULL,
	"role" integer NOT NULL,
	"last_login_ip" "inet",
	"last_login_user_agent" text,
	"can_view_all_locations" boolean NOT NULL,
	"location" varchar(50),
	"plain_password" varchar(128),
	"roles" integer[] NOT NULL,
	CONSTRAINT "administration_user_email_key" UNIQUE("email"),
	CONSTRAINT "administration_user_phone_number_key" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "administration_user_filling_stations" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_user_filling_stations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"deliverycustomer_id" bigint NOT NULL,
	CONSTRAINT "administration_user_fill_user_id_deliverycustomer_4b750c4a_uniq" UNIQUE("user_id","deliverycustomer_id")
);
--> statement-breakpoint
CREATE TABLE "administration_user_groups" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_user_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "administration_user_groups_user_id_group_id_97943ac2_uniq" UNIQUE("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "administration_user_locations" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_user_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"states_id" bigint NOT NULL,
	CONSTRAINT "administration_user_locations_user_id_states_id_1dde7470_uniq" UNIQUE("user_id","states_id")
);
--> statement-breakpoint
CREATE TABLE "administration_user_lpg_plants" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_user_lpg_plants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"lpgplant_id" bigint NOT NULL,
	CONSTRAINT "administration_user_lpg__user_id_lpgplant_id_3adf278f_uniq" UNIQUE("user_id","lpgplant_id")
);
--> statement-breakpoint
CREATE TABLE "administration_user_pfis" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_user_pfis_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"pfi_id" bigint NOT NULL,
	CONSTRAINT "administration_user_pfis_user_id_pfi_id_31210bc5_uniq" UNIQUE("user_id","pfi_id")
);
--> statement-breakpoint
CREATE TABLE "administration_usertoken" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_usertoken_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"key" varchar(64) NOT NULL,
	"created" timestamp with time zone NOT NULL,
	"user_agent" text NOT NULL,
	"ip_address" "inet",
	"user_id" bigint NOT NULL,
	CONSTRAINT "administration_usertoken_key_key" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "administration_user_user_permissions" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "administration_user_user_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"permission_id" integer NOT NULL,
	CONSTRAINT "administration_user_user_user_id_permission_id_1258dc72_uniq" UNIQUE("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(100) NOT NULL,
	"actor_type" "audit_actor_type" DEFAULT 'system' NOT NULL,
	"actor_id" integer,
	"actor_name" varchar(255) DEFAULT '',
	"entity_type" varchar(100) DEFAULT '',
	"entity_id" varchar(64) DEFAULT '',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"prev_state" varchar(32),
	"new_state" varchar(32),
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_staff_id" integer,
	"actor_customer_id" integer,
	"metadata" jsonb,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_arc_check" CHECK (("audit_logs"."actor_type" = 'staff'    AND "audit_logs"."actor_staff_id"    IS NOT NULL AND "audit_logs"."actor_customer_id" IS NULL)
       OR ("audit_logs"."actor_type" = 'customer' AND "audit_logs"."actor_customer_id" IS NOT NULL AND "audit_logs"."actor_staff_id"    IS NULL)
       OR ("audit_logs"."actor_type" = 'system'   AND "audit_logs"."actor_staff_id"    IS NULL     AND "audit_logs"."actor_customer_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "auth_group" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "auth_group_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(150) NOT NULL,
	CONSTRAINT "auth_group_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "auth_group_permissions" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "auth_group_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"group_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	CONSTRAINT "auth_group_permissions_group_id_permission_id_0cd325b0_uniq" UNIQUE("group_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "auth_permission" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "auth_permission_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"content_type_id" integer NOT NULL,
	"codename" varchar(100) NOT NULL,
	CONSTRAINT "auth_permission_content_type_id_codename_01ab375a_uniq" UNIQUE("content_type_id","codename")
);
--> statement-breakpoint
CREATE TABLE "authtoken_token" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"created" timestamp with time zone NOT NULL,
	"user_id" bigint NOT NULL,
	CONSTRAINT "authtoken_token_user_id_key" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "auth_user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"password" varchar(128) NOT NULL,
	"last_login" timestamp with time zone,
	"is_superuser" boolean NOT NULL,
	"username" varchar(150) NOT NULL,
	"first_name" varchar(150) NOT NULL,
	"last_name" varchar(150) NOT NULL,
	"email" varchar(254) NOT NULL,
	"is_staff" boolean NOT NULL,
	"is_active" boolean NOT NULL,
	"date_joined" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_user_username_key" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auth_user_groups" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "auth_user_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "auth_user_groups_user_id_group_id_94350c0c_uniq" UNIQUE("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "auth_user_user_permissions" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "auth_user_user_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	CONSTRAINT "auth_user_user_permissions_user_id_permission_id_14a6b632_uniq" UNIQUE("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"bank_code" varchar(50) DEFAULT '',
	"branch_name" varchar(150) DEFAULT '',
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"status" varchar(20) DEFAULT 'Active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"depot_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lpg_station_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statement_column_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_account_id" integer NOT NULL,
	"header_row" integer DEFAULT 0 NOT NULL,
	"date_column" integer NOT NULL,
	"amount_column" integer,
	"credit_column" integer,
	"depositor_column" integer,
	"reference_column" integer,
	"narration_column" integer,
	"sample_headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statements" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_account_id" integer NOT NULL,
	"filename" varchar(255) DEFAULT '' NOT NULL,
	"uploaded_by" integer,
	"row_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_account_id" integer NOT NULL,
	"statement_id" integer NOT NULL,
	"txn_date" timestamp with time zone NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"depositor" varchar(255) DEFAULT '' NOT NULL,
	"bank_ref" varchar(255) DEFAULT '' NOT NULL,
	"narration" text DEFAULT '' NOT NULL,
	"raw_row" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dedup_key" varchar(32) NOT NULL,
	"status" "statement_line_status" DEFAULT 'UNMATCHED' NOT NULL,
	"matched_order_id" integer,
	"matched_deposit_id" integer,
	"matched_by" integer,
	"matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"depot_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"commission_rate" numeric(15, 2) NOT NULL,
	"commission_amount" numeric(15, 2) NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commissions_quantity_check" CHECK ("commissions"."quantity" > 0),
	CONSTRAINT "commissions_rate_check" CHECK ("commissions"."commission_rate" >= 0),
	CONSTRAINT "commissions_amount_check" CHECK ("commissions"."commission_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customer_licenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"license_url" text DEFAULT '',
	"license_public_id" text DEFAULT '',
	"expiry_date" date,
	"status" "license_verification_status" DEFAULT 'pending' NOT NULL,
	"verified_by" integer,
	"verified_by_name" varchar(255) DEFAULT '',
	"verified_at" timestamp with time zone,
	"verification_comment" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_agent" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_agent_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(128) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"type" varchar(16) NOT NULL,
	"is_active" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"location_id" bigint,
	CONSTRAINT "consumer_agent_phone_key" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "consumer_auditlog" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_auditlog_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"action" varchar(64) NOT NULL,
	"actor_role" integer,
	"timestamp" timestamp with time zone NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"metadata" jsonb,
	"prev_state" varchar(64),
	"new_state" varchar(64),
	"actor_id" bigint,
	"order_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_bankacct" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_bankacct_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(200) NOT NULL,
	"acct_no" varchar(200),
	"bank_name" varchar(200),
	"created_at" timestamp with time zone NOT NULL,
	"suspended" boolean NOT NULL,
	"location_id" bigint,
	"is_active" boolean NOT NULL,
	"is_primary" boolean NOT NULL,
	"pfi_id" bigint,
	CONSTRAINT "consumer_bankacct_acct_no_key" UNIQUE("acct_no")
);
--> statement-breakpoint
CREATE TABLE "consumer_bankstatement" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_bankstatement_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"file" varchar(100) NOT NULL,
	"original_file_name" varchar(255),
	"row_count" integer NOT NULL,
	"new_line_count" integer NOT NULL,
	"duplicate_line_count" integer NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"bank_account_id" bigint NOT NULL,
	"uploaded_by_id" bigint,
	CONSTRAINT "consumer_bankstatement_row_count_check" CHECK (row_count >= 0),
	CONSTRAINT "consumer_bankstatement_new_line_count_check" CHECK (new_line_count >= 0),
	CONSTRAINT "consumer_bankstatement_duplicate_line_count_check" CHECK (duplicate_line_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_bankstatementcolumnmapping" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_bankstatementcolumnmapping_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"header_row" integer NOT NULL,
	"date_column" varchar(200) NOT NULL,
	"amount_column" varchar(200) NOT NULL,
	"depositor_column" varchar(200),
	"reference_column" varchar(200),
	"narration_column" varchar(200),
	"credit_column" varchar(200),
	"sample_file_name" varchar(255),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"bank_account_id" bigint NOT NULL,
	"created_by_id" bigint,
	CONSTRAINT "consumer_bankstatementcolumnmapping_bank_account_id_key" UNIQUE("bank_account_id"),
	CONSTRAINT "consumer_bankstatementcolumnmapping_header_row_check" CHECK (header_row >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_bankstatementline" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_bankstatementline_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"transaction_date" date NOT NULL,
	"depositor_name" varchar(255),
	"bank_ref" varchar(255),
	"amount" numeric(14, 2) NOT NULL,
	"narration" text,
	"raw_row" jsonb,
	"dedup_key" varchar(64) NOT NULL,
	"status" varchar(20) NOT NULL,
	"matched_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"bank_account_id" bigint NOT NULL,
	"matched_by_id" bigint,
	"matched_order_id" bigint,
	"matched_payment_record_id" bigint,
	"statement_id" bigint NOT NULL,
	CONSTRAINT "unique_bank_statement_line_per_account" UNIQUE("dedup_key","bank_account_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_customer" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_customer_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"first_name" varchar(200) NOT NULL,
	"last_name" varchar(200) NOT NULL,
	"company_name" varchar(200),
	"email" varchar(150),
	"phone_number" varchar(25),
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_deliveryorders" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_deliveryorders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"delivery_address" varchar(200) NOT NULL,
	"delivery_date" date,
	"delivery_time" time,
	"order_id" bigint NOT NULL,
	"delivery_state_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_depots" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_depots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(200) NOT NULL,
	"location" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_expensecategory" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_expensecategory_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"is_system_category" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"pfi_id" bigint,
	CONSTRAINT "consumer_expensecategory_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "consumer_fleetledgerentry" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_fleetledgerentry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entry_type" varchar(10) NOT NULL,
	"category" varchar(100) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" date NOT NULL,
	"description" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"truck_id" bigint NOT NULL,
	"entered_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "consumer_fleettruck" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_fleettruck_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"plate_number" varchar(50) NOT NULL,
	"driver_name" varchar(255) NOT NULL,
	"driver_phone" varchar(50),
	"notes" text,
	"is_active" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"max_capacity" integer,
	"chassis_number" varchar(255) NOT NULL,
	"driver_alt_phone" varchar(50) NOT NULL,
	"motor_boy_name" varchar(255) NOT NULL,
	"motor_boy_phone1" varchar(50) NOT NULL,
	"motor_boy_phone2" varchar(50) NOT NULL,
	"passport_photo" text NOT NULL,
	"spare_driver_name" varchar(255) NOT NULL,
	"spare_driver_phone" varchar(50) NOT NULL,
	"truck_make" varchar(255) NOT NULL,
	"truck_status" varchar(500) NOT NULL,
	"avg_litres_per_trip" double precision,
	"drivers_license_doc" text NOT NULL,
	"fuel_capacity" double precision,
	"incidents" text NOT NULL,
	"insurance_cert_doc" text NOT NULL,
	"insurance_expiry" date,
	"last_service_date" date,
	"mileage" integer,
	"next_service_date" date,
	"road_worthiness_expiry" date,
	"vehicle_papers_doc" text NOT NULL,
	CONSTRAINT "consumer_fleettruck_plate_number_key" UNIQUE("plate_number"),
	CONSTRAINT "consumer_fleettruck_max_capacity_check" CHECK (max_capacity >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_locationcommissionrate" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_locationcommissionrate_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"rate_below_500k" numeric(10, 2) NOT NULL,
	"rate_500k_to_1m" numeric(10, 2) NOT NULL,
	"rate_above_1m" numeric(10, 2) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"location_id" bigint NOT NULL,
	"updated_by_id" bigint,
	CONSTRAINT "consumer_locationcommissionrate_location_id_key" UNIQUE("location_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_lpgplant" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_lpgplant_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(200) NOT NULL,
	"capacity_kg" numeric(14, 2),
	"low_stock_threshold_kg" numeric(14, 2) NOT NULL,
	"is_active" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"location_id" bigint,
	"bulk_threshold_kg" numeric(14, 2) NOT NULL,
	"next_receipt_seq" integer NOT NULL,
	"price_per_kg" numeric(14, 2),
	"code" varchar(10) NOT NULL,
	CONSTRAINT "consumer_lpgplant_name_key" UNIQUE("name"),
	CONSTRAINT "consumer_lpgplant_code_11df6dd8_uniq" UNIQUE("code"),
	CONSTRAINT "consumer_lpgplant_next_receipt_seq_check" CHECK (next_receipt_seq >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_lpgsale" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_lpgsale_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"customer_name" varchar(255),
	"kg" numeric(14, 2) NOT NULL,
	"price_per_kg" numeric(14, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"invoice_number" varchar(100),
	"created_at" timestamp with time zone NOT NULL,
	"cashier_id" bigint,
	"plant_id" bigint NOT NULL,
	"bulk_discount_per_kg" numeric(14, 2),
	"is_bulk" boolean NOT NULL,
	CONSTRAINT "consumer_lpgsale_invoice_number_5db198f8_uniq" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "consumer_lpgstockentry" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_lpgstockentry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"opening_stock_kg" numeric(14, 2) NOT NULL,
	"received_kg" numeric(14, 2) NOT NULL,
	"sold_kg" numeric(14, 2) NOT NULL,
	"closing_stock_kg" numeric(14, 2) NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"plant_id" bigint NOT NULL,
	"recorded_by_id" bigint,
	CONSTRAINT "unique_lpg_stock_entry_per_plant_day" UNIQUE("date","plant_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_order" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_order_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"quantity" integer NOT NULL,
	"total_price" numeric(100, 2) NOT NULL,
	"status" varchar(200) NOT NULL,
	"release_status" varchar(200) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" bigint NOT NULL,
	"release_type" varchar(200) NOT NULL,
	"state_id" bigint,
	"customer_details" jsonb,
	"dpr_number" varchar(255),
	"driver_name" varchar(255),
	"driver_phone" varchar(50),
	"sales_ref" varchar(255),
	"truck_number" varchar(255),
	"assigned_agent_id" bigint,
	"loading_datetime" timestamp with time zone,
	"delivery_address" text,
	"loader_name" varchar(255),
	"loader_phone" varchar(50),
	"compartment_details" text,
	"comp1_qty" numeric(12, 2),
	"comp1_ullage" numeric(12, 2),
	"comp2_qty" numeric(12, 2),
	"comp2_ullage" numeric(12, 2),
	"comp3_qty" numeric(12, 2),
	"comp3_ullage" numeric(12, 2),
	"comp4_qty" numeric(12, 2),
	"comp4_ullage" numeric(12, 2),
	"comp5_qty" numeric(12, 2),
	"comp5_ullage" numeric(12, 2),
	"nmdrpa_number" varchar(255),
	"payment_confirmed_at" timestamp with time zone,
	"payment_confirmed_by_id" bigint,
	"released_at" timestamp with time zone,
	"released_by_id" bigint,
	"security_exited_at" timestamp with time zone,
	"security_exited_by_id" bigint,
	"truck_exited" boolean NOT NULL,
	"pfi_id" bigint,
	"payment_narration" text,
	"order_fingerprint" varchar(64),
	"customer_name" varchar(255),
	"customer_phone" varchar(50),
	"notes" text,
	"order_type" varchar(20) NOT NULL,
	"sold_at" timestamp with time zone,
	"sold_to_name" varchar(255),
	"sold_to_phone" varchar(50),
	"loading_date" date,
	"supervised_by" varchar(255),
	"destination_state" varchar(100),
	"destination_town" varchar(200),
	"paid_to_account_name" varchar(255),
	"paid_to_account_number" varchar(255),
	"paid_to_bank_name" varchar(255),
	"security_exit_gantry" varchar(20),
	"security_exit_loader_name" varchar(255),
	"ticket_generated_at" timestamp with time zone,
	"ticket_generated_by_id" bigint,
	"commission_amount" numeric(14, 2),
	"commission_paid_at" timestamp with time zone,
	"commission_paid_by_id" bigint,
	"commission_account_name" varchar(200),
	"commission_account_number" varchar(50),
	"commission_bank_name" varchar(200),
	"overpayment_flagged" boolean NOT NULL,
	"overpayment_status" varchar(30),
	"entry_driver_name" varchar(255),
	"entry_driver_phone" varchar(50),
	"security_entered_at" timestamp with time zone,
	"security_entered_by_id" bigint,
	"truck_entered" boolean NOT NULL,
	CONSTRAINT "consumer_order_quantity_check" CHECK (quantity >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_orderauditevent" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_orderauditevent_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"action" varchar(64) NOT NULL,
	"actor_email" varchar(255) NOT NULL,
	"actor_name" varchar(255) NOT NULL,
	"actor_role" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"actor_user_id" bigint,
	"order_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_orderpaymentinfo" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_orderpaymentinfo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"acct" varchar(200),
	"status" varchar(200) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"order_id" bigint NOT NULL,
	"payment_channel_id" bigint,
	"reference" varchar(64),
	"bank_account_id" bigint,
	"paid_to_account_name" varchar(200),
	"paid_to_account_number" varchar(200),
	"paid_to_bank_name" varchar(200),
	CONSTRAINT "consumer_orderpaymentinfo_order_id_key" UNIQUE("order_id"),
	CONSTRAINT "consumer_orderpaymentinfo_reference_key" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "consumer_orderpaymentrecord" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_orderpaymentrecord_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"amount" numeric(14, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"payer_name" varchar(255),
	"bank_name" varchar(200),
	"account_number" varchar(200),
	"account_name" varchar(200),
	"transaction_reference" varchar(64),
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"bank_account_id" bigint,
	"created_by_id" bigint,
	"order_id" bigint NOT NULL,
	CONSTRAINT "consumer_orderpaymentrecord_transaction_reference_key" UNIQUE("transaction_reference")
);
--> statement-breakpoint
CREATE TABLE "consumer_orderproduct" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_orderproduct_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"quantity" integer NOT NULL,
	"price" numeric(100, 2) NOT NULL,
	"order_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	CONSTRAINT "consumer_orderproduct_quantity_check" CHECK (quantity >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_overpaymenttransferrequest" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_overpaymenttransferrequest_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"amount" numeric(14, 2) NOT NULL,
	"narration" text,
	"status" varchar(20) NOT NULL,
	"requested_by_name" varchar(200) NOT NULL,
	"reviewed_by_name" varchar(200) NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"requested_by_id" bigint,
	"reviewed_by_id" bigint,
	"source_order_id" bigint NOT NULL,
	"target_order_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_paymentchannels" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_paymentchannels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(200) NOT NULL,
	"status" varchar(200) NOT NULL,
	"public_key" varchar(200),
	"init_url" varchar(200),
	"description" text NOT NULL,
	"c_name" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "consumer_paymentfile" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_paymentfile_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"file" varchar(100) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"order_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_paymentsplit" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_paymentsplit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"amount" numeric(100, 2) NOT NULL,
	"depositor_name" varchar(200) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"order_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_pfi" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_pfi_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pfi_number" varchar(100) NOT NULL,
	"starting_qty_litres" numeric(14, 2) NOT NULL,
	"notes" text,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_by_id" bigint,
	"location_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"finance_person_id" bigint,
	"marketing_person_id" bigint,
	"aggregate_expenses" numeric(16, 2),
	"closure_bank" varchar(200),
	"closure_date" date,
	"closure_handler" varchar(200),
	"closure_remarks" text,
	"purchase_cost" numeric(16, 2),
	"sales_manager_legacy" varchar(200),
	"total_inflow" numeric(16, 2),
	"pfi_date" date,
	"qty_volume_mt" numeric(14, 2),
	"vessel_broker" varchar(200),
	"vessel_name" varchar(200),
	"surveyor_name" varchar(200),
	"surveyor_phone" varchar(20),
	"audit_officer_id" bigint,
	"product_officer_id" bigint,
	"it_compliance_officer_id" bigint,
	"security_exit_officer_id" bigint,
	"commission_officer_id" bigint,
	"sales_manager_id" bigint,
	"bl_qty_litres" numeric(14, 2),
	"price_per_litre" numeric(14, 2),
	"bl_qty_mt" numeric(14, 2),
	"credit_balance" numeric(16, 2),
	CONSTRAINT "consumer_pfi_pfi_number_key" UNIQUE("pfi_number")
);
--> statement-breakpoint
CREATE TABLE "consumer_pfi_allowed_locations" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_pfi_allowed_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pfi_id" bigint NOT NULL,
	"states_id" bigint NOT NULL,
	CONSTRAINT "consumer_pfi_allowed_locations_pfi_id_states_id_55c44755_uniq" UNIQUE("pfi_id","states_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_pfiexpense" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_pfiexpense_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"description" varchar(255) NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"added_by_id" bigint,
	"pfi_id" bigint,
	"bank_paid_from" varchar(200) NOT NULL,
	"deleted_at" timestamp with time zone,
	"edited_by_id" bigint,
	"receipt_reference" varchar(100) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"vendor" varchar(255) NOT NULL,
	"category_id" bigint,
	"review_note" text NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" bigint,
	"status" varchar(24) NOT NULL,
	"admin_approved_at" timestamp with time zone,
	"admin_approved_by_id" bigint,
	"audit_approved_at" timestamp with time zone,
	"audit_approved_by_id" bigint,
	"paid_at" timestamp with time zone,
	"paid_by_id" bigint,
	"payee_account_name" varchar(255) NOT NULL,
	"payee_account_number" varchar(50) NOT NULL,
	"payee_bank_name" varchar(200) NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_id" bigint
);
--> statement-breakpoint
CREATE TABLE "consumer_pfiexpenseattachment" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_pfiexpenseattachment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"file" varchar(100) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"expense_id" bigint NOT NULL,
	"uploaded_by_id" bigint
);
--> statement-breakpoint
CREATE TABLE "consumer_pfiexpenseaudit" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_pfiexpenseaudit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"action" varchar(20) NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"expense_id" bigint NOT NULL,
	"performed_by_id" bigint
);
--> statement-breakpoint
CREATE TABLE "consumer_pfimovement" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_pfimovement_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"qty_litres" numeric(14, 2) NOT NULL,
	"action" varchar(30) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"order_id" bigint NOT NULL,
	"pfi_id" bigint NOT NULL,
	"user_id" bigint,
	CONSTRAINT "uniq_pfi_movement_per_order_action" UNIQUE("action","order_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_pickuporders" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_pickuporders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pickup_date" date,
	"pickup_time" time,
	"order_id" bigint NOT NULL,
	"state_id" bigint
);
--> statement-breakpoint
CREATE TABLE "consumer_pickuptruck" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_pickuptruck_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"truck_no" varchar(200),
	"pickup_order_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_product" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_product_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(200) NOT NULL,
	"abbreviation" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"stock_quantity" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"initial_stock_quantity" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean NOT NULL,
	"unit" varchar(10) NOT NULL,
	CONSTRAINT "consumer_product_initial_stock_quantity_check" CHECK (initial_stock_quantity >= 0),
	CONSTRAINT "consumer_product_stock_quantity_check" CHECK (stock_quantity >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_productprice" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_productprice_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"price" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"product_id" bigint NOT NULL,
	"state_id" bigint NOT NULL,
	"initial_stock_quantity" integer NOT NULL,
	"stock_quantity" integer NOT NULL,
	CONSTRAINT "consumer_productprice_product_id_state_id_819d2e1d_uniq" UNIQUE("product_id","state_id"),
	CONSTRAINT "consumer_productprice_initial_stock_quantity_check" CHECK (initial_stock_quantity >= 0),
	CONSTRAINT "consumer_productprice_stock_quantity_check" CHECK (stock_quantity >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_states" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_states_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(200) NOT NULL,
	"abbreviation" varchar(200) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"status" varchar(200) NOT NULL,
	"classifier" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_truck" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_truck_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"no" varchar(100) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "consumer_truck_no_key" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "consumer_truckallocation" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_truckallocation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"truck_number" integer NOT NULL,
	"quantity" numeric(14, 2) NOT NULL,
	"ticket_number" varchar(64) NOT NULL,
	"ticket_status" varchar(20) NOT NULL,
	"driver_name" varchar(255),
	"plate_number" varchar(100),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"order_id" bigint NOT NULL,
	"order_product_id" bigint NOT NULL,
	CONSTRAINT "uniq_truck_per_order_product" UNIQUE("truck_number","order_product_id"),
	CONSTRAINT "consumer_truckallocation_ticket_number_key" UNIQUE("ticket_number"),
	CONSTRAINT "consumer_truckallocation_truck_number_check" CHECK (truck_number >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_truckbreakdown" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_truckbreakdown_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"trucks" integer NOT NULL,
	"litres_per_truck" numeric(14, 2) NOT NULL,
	"notes" varchar(255),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"order_id" bigint NOT NULL,
	CONSTRAINT "consumer_truckbreakdown_trucks_check" CHECK (trucks >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumer_truckticket" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "consumer_truckticket_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"truck_number" integer NOT NULL,
	"quantity_litres" numeric(12, 2) NOT NULL,
	"driver_name" varchar(255),
	"driver_phone" varchar(50),
	"plate_number" varchar(100),
	"ticket_status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"order_id" bigint NOT NULL,
	"exited_at" timestamp with time zone,
	"exited_by_id" bigint,
	"gantry" varchar(20),
	"loader_name" varchar(255),
	"entered_at" timestamp with time zone,
	"entered_by_id" bigint,
	"entry_driver_name" varchar(255),
	"entry_driver_phone" varchar(50),
	CONSTRAINT "consumer_truckticket_order_id_truck_number_f2ddbd4c_uniq" UNIQUE("truck_number","order_id"),
	CONSTRAINT "consumer_truckticket_truck_number_check" CHECK (truck_number >= 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) DEFAULT '',
	"phone" varchar(30) NOT NULL,
	"company_name" varchar(255) DEFAULT '',
	"address" text DEFAULT '',
	"status" "customer_status" DEFAULT 'Active' NOT NULL,
	"marketing_opt_out" boolean DEFAULT false NOT NULL,
	"created_via" "customer_created_via" DEFAULT 'desk' NOT NULL,
	"balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"deposit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"previous_deposit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"paystack_customer_id" varchar(100) DEFAULT '',
	"virtual_account_number" varchar(30) DEFAULT '',
	"virtual_account_bank" varchar(100) DEFAULT '',
	"virtual_account_name" varchar(255) DEFAULT '',
	"dva_subaccount_code" varchar(100) DEFAULT '',
	"commission_bank_name" varchar(255) DEFAULT '',
	"commission_account_name" varchar(255) DEFAULT '',
	"commission_account_number" varchar(30) DEFAULT '',
	"phone_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"provider" "customer_identity_provider" NOT NULL,
	"provider_user_id" varchar(320) NOT NULL,
	"secret_hash" text,
	"verified" boolean DEFAULT false NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_trusted_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"device_name" varchar(255) DEFAULT '',
	"user_agent" varchar(512) DEFAULT '',
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_passkeys" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"credential_id" varchar(512) NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" jsonb,
	"device_name" varchar(255) DEFAULT '',
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"purpose" varchar(20) NOT NULL,
	"challenge" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"purpose" varchar(32) DEFAULT 'auth' NOT NULL,
	"code_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"request_ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_type" "report_type" DEFAULT 'sales_manager' NOT NULL,
	"report_date" date NOT NULL,
	"location" varchar(255) NOT NULL,
	"pfi_number" varchar(50) DEFAULT '' NOT NULL,
	"product_name" varchar(100) DEFAULT '',
	"carried_over_loading" numeric(15, 2) DEFAULT '0',
	"opening_stock" numeric(15, 2) DEFAULT '0',
	"received_stock" numeric(15, 2) DEFAULT '0',
	"litres_sold" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tank_balance" numeric(15, 2) DEFAULT '0',
	"loading_left_over" numeric(15, 2) DEFAULT '0',
	"price_bands" jsonb DEFAULT '[]'::jsonb,
	"avg_price" numeric(12, 2) DEFAULT '0',
	"total_sales_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(15, 2) DEFAULT '0' NOT NULL,
	"differentials" numeric(15, 2) DEFAULT '0',
	"truck_count" integer DEFAULT 0 NOT NULL,
	"yesterday_deficit_payment" numeric(15, 2) DEFAULT '0',
	"yesterday_surplus_payment" numeric(15, 2) DEFAULT '0',
	"total_inflow" numeric(15, 2) DEFAULT '0',
	"trucks_entered" integer,
	"bank_name" varchar(255) DEFAULT '',
	"account_number" varchar(50) DEFAULT '',
	"customer_count" integer,
	"order_count" integer,
	"rates" text DEFAULT '',
	"top_customers" jsonb DEFAULT '[]'::jsonb,
	"remarks" text DEFAULT '',
	"status" "daily_report_status" DEFAULT 'submitted' NOT NULL,
	"submitted_by" integer,
	"submitted_by_name" varchar(255) DEFAULT '',
	"reviewed_by" integer,
	"reviewed_by_name" varchar(255) DEFAULT '',
	"reviewed_at" timestamp with time zone,
	"review_comment" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_reports_litres_check" CHECK ("daily_reports"."litres_sold" >= 0),
	CONSTRAINT "daily_reports_trucks_check" CHECK ("daily_reports"."truck_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "dangote_order_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_number" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"company_name" varchar(255) DEFAULT '',
	"license_id" integer,
	"product" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"quantity_unit" varchar(20) DEFAULT 'Tons' NOT NULL,
	"delivery_address" text NOT NULL,
	"delivery_state" varchar(100) DEFAULT '',
	"delivery_lga" varchar(100) DEFAULT '',
	"status" varchar(30) DEFAULT 'Pending Review' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'Unpaid' NOT NULL,
	"collection_status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"price_per_unit" numeric(15, 2),
	"delivery_price" numeric(15, 2),
	"total_amount" numeric(15, 2),
	"expected_arrival_date" varchar(20),
	"payment_reference" varchar(100),
	"payment_mode" varchar(50),
	"virtual_account_number" varchar(30) DEFAULT '',
	"virtual_account_bank" varchar(100) DEFAULT '',
	"virtual_account_name" varchar(255) DEFAULT '',
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dangote_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(50) NOT NULL,
	"category" varchar(100) NOT NULL,
	"unit" varchar(30) DEFAULT 'Tons' NOT NULL,
	"description" text DEFAULT '',
	"plants" text DEFAULT '[]' NOT NULL,
	"status" varchar(20) DEFAULT 'Active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_type" "delivery_customer_type" NOT NULL,
	"customer_code" varchar(50),
	"name" varchar(255) NOT NULL,
	"phone_number" varchar(30) NOT NULL,
	"alt_phone_number" varchar(30) DEFAULT '',
	"email" varchar(255) DEFAULT '',
	"home_address" text DEFAULT '',
	"office_address" text DEFAULT '',
	"passport_photo" text DEFAULT '',
	"contact_person" varchar(255) DEFAULT '',
	"contact_person_phone" varchar(30) DEFAULT '',
	"station_address" text DEFAULT '',
	"tank_capacity" integer DEFAULT 0,
	"pump_count" integer DEFAULT 1,
	"bank_details" jsonb DEFAULT '{}'::jsonb,
	"contacts" jsonb DEFAULT '[]'::jsonb,
	"addresses" jsonb DEFAULT '[]'::jsonb,
	"paystack_customer_id" varchar(100) DEFAULT '',
	"virtual_account_number" varchar(30) DEFAULT '',
	"virtual_account_bank" varchar(100) DEFAULT '',
	"virtual_account_name" varchar(255) DEFAULT '',
	"credit_limit" numeric(15, 2) DEFAULT '0',
	"status" "delivery_customer_status" DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '',
	"last_transaction_date" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"truck_id" integer,
	"truck_number" varchar(30) DEFAULT '',
	"pfi_id" integer,
	"pfi_number" varchar(100) DEFAULT '',
	"pfi_product" varchar(255) DEFAULT '',
	"depot" varchar(255) DEFAULT '',
	"customer_id" integer,
	"customer_name" varchar(255) DEFAULT '',
	"quantity_allocated" real DEFAULT 0,
	"rate" numeric(15, 2) DEFAULT '0',
	"date_allocated" varchar(20) DEFAULT '',
	"date_offloaded" varchar(20),
	"loading_status" "loading_status" DEFAULT 'loaded' NOT NULL,
	"location" varchar(255) DEFAULT '',
	"pfi_location" varchar(255) DEFAULT '',
	"allocation_code" varchar(100),
	"collection_accounts" jsonb DEFAULT '[]'::jsonb,
	"remittance_accounts" jsonb DEFAULT '[]'::jsonb,
	"notes" text DEFAULT '',
	"created_by" varchar(255) DEFAULT '',
	"offloaded_by" varchar(255) DEFAULT '',
	"release_status" "release_status" DEFAULT 'pending' NOT NULL,
	"confirmed_by" varchar(255) DEFAULT '',
	"confirmed_at" timestamp with time zone,
	"released_by" varchar(255) DEFAULT '',
	"released_at" timestamp with time zone,
	"rejection_reason" text DEFAULT '',
	"ticket_number" varchar(100) DEFAULT '',
	"ticket_generated_at" timestamp with time zone,
	"is_fully_paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_ledger_settings" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "delivery_ledger_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"key" varchar(100) NOT NULL,
	"trip_codes" jsonb NOT NULL,
	"pfi_code_map" jsonb NOT NULL,
	"loading_code_map" jsonb NOT NULL,
	"sale_trip_map" jsonb NOT NULL,
	"cycle_alias_map" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by_id" bigint,
	CONSTRAINT "delivery_ledger_settings_key_key" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "delivery_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_note_number" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"customer_type_snapshot" "delivery_customer_type" NOT NULL,
	"order_id" integer,
	"delivery_address" text NOT NULL,
	"contact_person_on_site" jsonb DEFAULT '{}'::jsonb,
	"product" varchar(255) NOT NULL,
	"quantity_delivered" real NOT NULL,
	"unit" varchar(30) DEFAULT 'Liters',
	"driver" jsonb DEFAULT '{}'::jsonb,
	"truck" jsonb DEFAULT '{}'::jsonb,
	"depot_of_loading" varchar(255) DEFAULT '',
	"dispatch_date" timestamp with time zone DEFAULT now(),
	"expected_delivery_date" timestamp with time zone,
	"status" "delivery_note_status" DEFAULT 'Pending' NOT NULL,
	"remarks" text DEFAULT '',
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_notes_qty_check" CHECK ("delivery_notes"."quantity_delivered" > 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"truck_number" varchar(30) DEFAULT '',
	"date_loaded" varchar(20) DEFAULT '',
	"depot_loaded" varchar(255) DEFAULT '',
	"customer_id" integer,
	"customer_name" varchar(255) DEFAULT '',
	"location" varchar(255) DEFAULT '',
	"quantity" real DEFAULT 0,
	"rate" numeric(15, 2) DEFAULT '0',
	"sales_value" numeric(15, 2) DEFAULT '0',
	"payment_amount" numeric(15, 2) DEFAULT '0',
	"expenses_amount" numeric(15, 2) DEFAULT '0',
	"balance" numeric(15, 2) DEFAULT '0',
	"payer_name" varchar(255) DEFAULT '',
	"bank" varchar(255) DEFAULT '',
	"date_of_payment" varchar(20),
	"deposit_status" "deposit_status_enum" DEFAULT 'pending' NOT NULL,
	"phone_number" varchar(30) DEFAULT '',
	"remarks" text DEFAULT '',
	"entered_by" varchar(255) DEFAULT '',
	"allocation_code" varchar(100),
	"collection_accounts" jsonb DEFAULT '[]'::jsonb,
	"remittance_accounts" jsonb DEFAULT '[]'::jsonb,
	"payment_method" "payment_method" DEFAULT 'manual' NOT NULL,
	"paystack_reference" varchar(255),
	"paystack_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"depot_id" integer,
	"pfi_id" integer,
	"amount" numeric(15, 2) NOT NULL,
	"type" "deposit_type" NOT NULL,
	"description" text DEFAULT '',
	"reference" varchar(255) DEFAULT '',
	"recorded_by" integer,
	"balance_after" numeric(15, 2) DEFAULT '0',
	"paystack_details" jsonb,
	"remaining_amount" numeric(15, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_amount_check" CHECK ("deposits"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "depots" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"country" varchar(100) NOT NULL,
	"postcode" varchar(20) NOT NULL,
	"parked_trucks_count" integer DEFAULT 0 NOT NULL,
	"max_capacity" integer NOT NULL,
	"status" "depot_status" DEFAULT 'Active' NOT NULL,
	"established_year" varchar(10) NOT NULL,
	"paystack_subaccount_code" varchar(100) DEFAULT '',
	"subaccount_active" boolean DEFAULT false NOT NULL,
	"subaccount_split_percentage" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depots_max_capacity_check" CHECK ("depots"."max_capacity" >= 1),
	CONSTRAINT "depots_parked_trucks_check" CHECK ("depots"."parked_trucks_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "depot_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_product_price_id" integer NOT NULL,
	"price" numeric(15, 2) NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "depot_product_capacities" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depot_product_cap_check" CHECK ("depot_product_capacities"."capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "depot_product_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"commission_rate" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depot_product_commission_rate_check" CHECK ("depot_product_commissions"."commission_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "depot_product_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"current_price" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depot_product_price_check" CHECK ("depot_product_prices"."current_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "depot_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"principal_type" "principal_type" NOT NULL,
	"staff_id" integer,
	"customer_id" integer,
	"token" text NOT NULL,
	"provider" varchar(16) DEFAULT 'fcm' NOT NULL,
	"platform" "device_token_platform" NOT NULL,
	"device_id" varchar(128) DEFAULT '' NOT NULL,
	"device_name" varchar(255) DEFAULT '' NOT NULL,
	"app_version" varchar(32) DEFAULT '' NOT NULL,
	"locale" varchar(16) DEFAULT '' NOT NULL,
	"timezone" varchar(64) DEFAULT '' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_reason" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_principal_arc_check" CHECK (("device_tokens"."principal_type" = 'staff'    AND "device_tokens"."staff_id"    IS NOT NULL AND "device_tokens"."customer_id" IS NULL)
       OR ("device_tokens"."principal_type" = 'customer' AND "device_tokens"."customer_id" IS NOT NULL AND "device_tokens"."staff_id"    IS NULL))
);
--> statement-breakpoint
CREATE TABLE "django_admin_log" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "django_admin_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"action_time" timestamp with time zone NOT NULL,
	"object_id" text,
	"object_repr" varchar(200) NOT NULL,
	"action_flag" smallint NOT NULL,
	"change_message" text NOT NULL,
	"content_type_id" integer,
	"user_id" integer NOT NULL,
	CONSTRAINT "django_admin_log_action_flag_check" CHECK (action_flag >= 0)
);
--> statement-breakpoint
CREATE TABLE "django_celery_beat_clockedschedule" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "django_celery_beat_clockedschedule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clocked_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "django_celery_beat_crontabschedule" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "django_celery_beat_crontabschedule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"minute" varchar(240) NOT NULL,
	"hour" varchar(96) NOT NULL,
	"day_of_week" varchar(64) NOT NULL,
	"day_of_month" varchar(124) NOT NULL,
	"month_of_year" varchar(64) NOT NULL,
	"timezone" varchar(63) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "django_celery_beat_intervalschedule" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "django_celery_beat_intervalschedule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"every" integer NOT NULL,
	"period" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "django_celery_beat_periodictask" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "django_celery_beat_periodictask_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(200) NOT NULL,
	"task" varchar(200) NOT NULL,
	"args" text NOT NULL,
	"kwargs" text NOT NULL,
	"queue" varchar(200),
	"exchange" varchar(200),
	"routing_key" varchar(200),
	"expires" timestamp with time zone,
	"enabled" boolean NOT NULL,
	"last_run_at" timestamp with time zone,
	"total_run_count" integer NOT NULL,
	"date_changed" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"crontab_id" integer,
	"interval_id" integer,
	"solar_id" integer,
	"one_off" boolean NOT NULL,
	"start_time" timestamp with time zone,
	"priority" integer,
	"headers" text NOT NULL,
	"clocked_id" integer,
	"expire_seconds" integer,
	CONSTRAINT "django_celery_beat_periodictask_name_key" UNIQUE("name"),
	CONSTRAINT "django_celery_beat_periodictask_total_run_count_check" CHECK (total_run_count >= 0),
	CONSTRAINT "django_celery_beat_periodictask_priority_check" CHECK (priority >= 0),
	CONSTRAINT "django_celery_beat_periodictask_expire_seconds_check" CHECK (expire_seconds >= 0)
);
--> statement-breakpoint
CREATE TABLE "django_celery_beat_periodictasks" (
	"ident" smallint PRIMARY KEY NOT NULL,
	"last_update" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "django_celery_beat_solarschedule" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "django_celery_beat_solarschedule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event" varchar(24) NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	CONSTRAINT "django_celery_beat_solar_event_latitude_longitude_ba64999a_uniq" UNIQUE("event","latitude","longitude")
);
--> statement-breakpoint
CREATE TABLE "django_content_type" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "django_content_type_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"app_label" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	CONSTRAINT "django_content_type_app_label_model_76bd3d3b_uniq" UNIQUE("app_label","model")
);
--> statement-breakpoint
CREATE TABLE "django_migrations" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "django_migrations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"app" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"applied" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "django_session" (
	"session_key" varchar(40) PRIMARY KEY NOT NULL,
	"session_data" text NOT NULL,
	"expire_date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) DEFAULT '',
	"phone" varchar(30) NOT NULL,
	"license_number" varchar(100) NOT NULL,
	"license_class" varchar(50) NOT NULL,
	"rating" real DEFAULT 0,
	"status" "driver_status" DEFAULT 'Active' NOT NULL,
	"assigned_truck_ref" integer,
	"safety_score" integer DEFAULT 0,
	"license_expiry" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_rating_check" CHECK ("drivers"."rating" >= 0 AND "drivers"."rating" <= 5),
	CONSTRAINT "drivers_safety_score_check" CHECK ("drivers"."safety_score" >= 0 AND "drivers"."safety_score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "driver_truck_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer NOT NULL,
	"truck_id" integer NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expected_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" integer,
	"depot_id" integer,
	"pfi_id" integer,
	"expected_amount" numeric(15, 2),
	"reference" varchar(255) DEFAULT '',
	"note" text DEFAULT '',
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"matched_deposit_id" integer,
	"created_by" integer,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleet_ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"truck_id" integer NOT NULL,
	"entry_type" "fleet_entry_type" NOT NULL,
	"category" varchar(100) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"entry_date" date NOT NULL,
	"description" text DEFAULT '',
	"entered_by" varchar(255) DEFAULT '',
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_ledger_amount_check" CHECK ("fleet_ledger_entries"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "fleet_trucks" (
	"id" serial PRIMARY KEY NOT NULL,
	"plate_number" varchar(50) NOT NULL,
	"truck_make" varchar(255) DEFAULT '',
	"chassis_number" varchar(255) DEFAULT '',
	"max_capacity" integer,
	"vin" varchar(50),
	"year" integer,
	"model" varchar(100),
	"truck_type" varchar(100),
	"fuel_level" integer DEFAULT 100,
	"registration_expiry" date,
	"next_service_mileage" integer,
	"driver_id" integer,
	"fuel_capacity" real,
	"avg_litres_per_trip" real,
	"mileage" integer,
	"driver_name" varchar(255) DEFAULT '',
	"driver_phone" varchar(50) DEFAULT '',
	"driver_alt_phone" varchar(50) DEFAULT '',
	"motor_boy_name" varchar(255) DEFAULT '',
	"motor_boy_phone" varchar(50) DEFAULT '',
	"spare_driver_name" varchar(255) DEFAULT '',
	"spare_driver_phone" varchar(50) DEFAULT '',
	"insurance_expiry" date,
	"road_worthiness_expiry" date,
	"last_service_date" date,
	"next_service_date" date,
	"documents" jsonb DEFAULT '[]'::jsonb,
	"passport_photo" text DEFAULT '',
	"truck_status" varchar(500) DEFAULT '',
	"is_active" boolean DEFAULT true NOT NULL,
	"incidents" text DEFAULT '[]',
	"notes" text DEFAULT '',
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_trucks_mileage_check" CHECK ("fleet_trucks"."mileage" IS NULL OR "fleet_trucks"."mileage" >= 0)
);
--> statement-breakpoint
CREATE TABLE "incident_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_type" "incident_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text DEFAULT '',
	"location" varchar(255) DEFAULT '',
	"amount" numeric(15, 2),
	"pfi_id" integer,
	"pfi_number" varchar(100) DEFAULT '',
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"status" "incident_status" DEFAULT 'submitted' NOT NULL,
	"status_note" text DEFAULT '',
	"submitted_by" integer,
	"submitted_by_name" varchar(255) DEFAULT '',
	"reviewed_by" integer,
	"reviewed_by_name" varchar(255) DEFAULT '',
	"reviewed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_records_amount_check" CHECK ("incident_records"."amount" IS NULL OR "incident_records"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"surname" varchar(100) NOT NULL,
	"other_names" varchar(200) DEFAULT '',
	"email" varchar(255) NOT NULL,
	"phone_number" varchar(30),
	"password" text,
	"is_password_set" boolean DEFAULT false NOT NULL,
	"password_reset_token" text,
	"password_reset_expires" timestamp with time zone,
	"roles" text[] DEFAULT ARRAY['admin']::text[] NOT NULL,
	"can_view_all_locations" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"profile_picture_url" text,
	"profile_picture_public_id" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(50) NOT NULL,
	"category" varchar(100) NOT NULL,
	"product_type" varchar(50) DEFAULT 'soroman' NOT NULL,
	"grade_class" varchar(100) DEFAULT '',
	"description" text DEFAULT '',
	"density" varchar(50) DEFAULT '',
	"flash_point" varchar(50) DEFAULT '',
	"un_number" varchar(50) DEFAULT '',
	"hazard_class" varchar(50) DEFAULT 'None',
	"stock_level" integer DEFAULT 0,
	"unit" varchar(30) DEFAULT 'Liters',
	"supplier" varchar(255) DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lpg_stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"country" varchar(100) NOT NULL,
	"postcode" varchar(20) NOT NULL,
	"lpg_capacity_kg" integer NOT NULL,
	"price_per_kg" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" "depot_status" DEFAULT 'Active' NOT NULL,
	"established_year" varchar(10) NOT NULL,
	"paystack_subaccount_code" varchar(100) DEFAULT '',
	"subaccount_active" boolean DEFAULT false NOT NULL,
	"subaccount_split_percentage" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lpg_stations_capacity_check" CHECK ("lpg_stations"."lpg_capacity_kg" >= 1)
);
--> statement-breakpoint
CREATE TABLE "lpg_station_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"lpg_station_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lpg_station_cylinders" (
	"id" serial PRIMARY KEY NOT NULL,
	"lpg_station_id" integer NOT NULL,
	"cylinder_size_kg" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lpg_station_cylinders_size_check" CHECK ("lpg_station_cylinders"."cylinder_size_kg" >= 1),
	CONSTRAINT "lpg_station_cylinders_qty_check" CHECK ("lpg_station_cylinders"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "lpg_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"lpg_station_id" integer NOT NULL,
	"price_per_kg" numeric(15, 2) NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pfis" (
	"id" serial PRIMARY KEY NOT NULL,
	"pfi_number" varchar(100) NOT NULL,
	"status" "pfi_status" DEFAULT 'active' NOT NULL,
	"description" text DEFAULT '',
	"pfi_date" timestamp with time zone,
	"location_id" integer,
	"lpg_station_id" integer,
	"location_name" varchar(255) DEFAULT '',
	"product_id" integer,
	"product_name" varchar(255) DEFAULT '',
	"product_unit" varchar(30) DEFAULT 'Litres',
	"starting_qty_litres" integer DEFAULT 0 NOT NULL,
	"bl_qty_litres" integer,
	"bl_qty_mt" real,
	"qty_volume_mt" real DEFAULT 0,
	"sold_qty_litres" integer DEFAULT 0 NOT NULL,
	"total_amount" numeric(15, 2) DEFAULT '0',
	"unit_price" numeric(15, 2) DEFAULT '0',
	"credit_balance" numeric(15, 2) DEFAULT '0',
	"audit_officer_id" integer,
	"audit_officer_name" varchar(255) DEFAULT '',
	"product_officer_id" integer,
	"product_officer_name" varchar(255) DEFAULT '',
	"it_compliance_officer_id" integer,
	"it_compliance_officer_name" varchar(255) DEFAULT '',
	"security_exit_officer_id" integer,
	"security_exit_officer_name" varchar(255) DEFAULT '',
	"commission_officer_id" integer,
	"commission_officer_name" varchar(255) DEFAULT '',
	"sales_manager_id" integer,
	"sales_manager_name" varchar(255) DEFAULT '',
	"vessel_broker" varchar(255) DEFAULT '',
	"vessel_name" varchar(255) DEFAULT '',
	"surveyor_name" varchar(255) DEFAULT '',
	"surveyor_phone" varchar(30) DEFAULT '',
	"closure_date" timestamp with time zone,
	"total_inflow" numeric(15, 2) DEFAULT '0',
	"closure_bank" varchar(255) DEFAULT '',
	"purchase_cost" numeric(15, 2) DEFAULT '0',
	"aggregate_expenses" numeric(15, 2) DEFAULT '0',
	"closure_handler" varchar(255) DEFAULT '',
	"closure_remarks" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pfis_qty_check" CHECK ("pfis"."starting_qty_litres" >= 0),
	CONSTRAINT "pfis_sold_qty_check" CHECK ("pfis"."sold_qty_litres" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pfi_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"pfi_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"state" varchar(100) NOT NULL,
	"depot_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(15, 2) NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"delivery_type" "order_delivery_type" NOT NULL,
	"delivery_address" text DEFAULT '' NOT NULL,
	"company_name" varchar(255) DEFAULT '' NOT NULL,
	"pfi_id" integer,
	"virtual_account_number" varchar(30) DEFAULT '',
	"virtual_account_bank" varchar(100) DEFAULT '',
	"virtual_account_name" varchar(255) DEFAULT '',
	"payment_status" "order_payment_status" DEFAULT 'Unpaid' NOT NULL,
	"status" "order_status" DEFAULT 'Pending' NOT NULL,
	"payment_confirmed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"released_by" integer,
	"loading_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" integer,
	"cancellation_reason" text,
	"expired_at" timestamp with time zone,
	"idempotency_key" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_quantity_check" CHECK ("orders"."quantity" > 0),
	CONSTRAINT "orders_price_check" CHECK ("orders"."price" >= 0),
	CONSTRAINT "orders_total_check" CHECK ("orders"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_person" varchar(255) DEFAULT '',
	"phone" varchar(50) DEFAULT '',
	"email" varchar(255) DEFAULT '',
	"address" text DEFAULT '',
	"bank_name" varchar(200) DEFAULT '',
	"account_number" varchar(50) DEFAULT '',
	"account_name" varchar(255) DEFAULT '',
	"tax_id" varchar(50) DEFAULT '',
	"status" varchar(20) DEFAULT 'Active' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"gl_code" varchar(20),
	"gl_group" varchar(40),
	"gl_subgroup" varchar(60) DEFAULT '' NOT NULL,
	"pfi_id" integer,
	"is_system_category" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pfi_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"pfi_id" integer,
	"category_id" integer NOT NULL,
	"expense_date" timestamp with time zone DEFAULT now() NOT NULL,
	"vendor" varchar(255) DEFAULT '',
	"vendor_id" integer,
	"tin_number" varchar(30) DEFAULT '' NOT NULL,
	"invoice_number" varchar(100) DEFAULT '' NOT NULL,
	"description" text DEFAULT '',
	"amount" numeric(15, 2) NOT NULL,
	"amount_ex_vat" numeric(15, 2),
	"vat_amount" numeric(15, 2),
	"invoice_amount" numeric(15, 2),
	"wht_deduction" numeric(15, 2) DEFAULT '0' NOT NULL,
	"wht_rate" numeric(5, 2),
	"amount_paid" numeric(15, 2),
	"bank_paid_from" varchar(255) DEFAULT '',
	"payment_reference" varchar(100) DEFAULT '' NOT NULL,
	"receipt_reference" varchar(100) DEFAULT '',
	"payment_date" timestamp with time zone,
	"payment_method" varchar(30) DEFAULT '' NOT NULL,
	"payment_notes" text DEFAULT '' NOT NULL,
	"payee_bank_name" varchar(200) DEFAULT '',
	"bank_code" varchar(20) DEFAULT '' NOT NULL,
	"payee_account_number" varchar(50) DEFAULT '',
	"payee_account_name" varchar(255) DEFAULT '',
	"status" "expense_status" DEFAULT 'pending' NOT NULL,
	"verified_by" integer,
	"verified_at" timestamp with time zone,
	"audit_approved_by" integer,
	"audit_approved_at" timestamp with time zone,
	"admin_approved_by" integer,
	"admin_approved_at" timestamp with time zone,
	"paid_by" integer,
	"paid_at" timestamp with time zone,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"review_note" text DEFAULT '',
	"added_by" integer,
	"edited_by" integer,
	"entered_by" varchar(255) DEFAULT '',
	"recorded_by" integer,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference_number" varchar(20) GENERATED ALWAYS AS ('EXP-' || EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC')::int::text || '-' || LPAD(id::text, 6, '0')) STORED,
	CONSTRAINT "pfi_expenses_amount_check" CHECK ("pfi_expenses"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pfi_expense_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" integer NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" varchar(255) DEFAULT '',
	"content_type" varchar(120) DEFAULT '',
	"size_bytes" integer DEFAULT 0,
	"type" varchar(30),
	"uploaded_by" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pfi_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"pfi_id" integer NOT NULL,
	"order_id" integer,
	"action" varchar(30) DEFAULT 'RELEASE' NOT NULL,
	"qty_litres" integer NOT NULL,
	"notes" text DEFAULT '',
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pfi_expense_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" integer,
	"action" varchar(20) NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb,
	"actor_id" integer,
	"actor_name" varchar(255) DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pfi_expense_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" integer NOT NULL,
	"body" text NOT NULL,
	"author_id" integer,
	"author_name" varchar(255) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_pfi_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"pfi_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_number" varchar(50) NOT NULL,
	"order_id" integer NOT NULL,
	"order_truck_id" integer,
	"status" "ticket_status" DEFAULT 'Active' NOT NULL,
	"qr_code_data_url" text NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_deposit_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"deposit_id" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_holds" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"status" "wallet_hold_status" DEFAULT 'active' NOT NULL,
	"description" text DEFAULT '',
	"deposit_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "wallet_holds_amount_check" CHECK ("wallet_holds"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_status" DEFAULT 'pending' NOT NULL,
	"error" text DEFAULT '',
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"principal_type" "principal_type" NOT NULL,
	"staff_id" integer,
	"customer_id" integer,
	"refresh_token_hash" char(64) NOT NULL,
	"family_id" uuid NOT NULL,
	"replaced_by_id" integer,
	"revoked_reason" varchar(32),
	"device_name" varchar(255) DEFAULT '',
	"user_agent" text,
	"ip_address" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_principal_arc_check" CHECK (("sessions"."principal_type" = 'staff'    AND "sessions"."staff_id"    IS NOT NULL AND "sessions"."customer_id" IS NULL)
       OR ("sessions"."principal_type" = 'customer' AND "sessions"."customer_id" IS NOT NULL AND "sessions"."staff_id"    IS NULL))
);
--> statement-breakpoint
CREATE TABLE "order_trucks" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"truck_index" smallint NOT NULL,
	"truck_id" integer,
	"truck_number" varchar(100),
	"quantity" numeric(15, 2) NOT NULL,
	"compartments" jsonb,
	"driver_name" varchar(255),
	"driver_phone" varchar(50),
	"entry_driver_name" varchar(255),
	"entry_driver_phone" varchar(50),
	"gantry" varchar(20),
	"loader_name" varchar(255),
	"loader_phone" varchar(50),
	"status" "order_truck_status" DEFAULT 'pending' NOT NULL,
	"security_entered_at" timestamp with time zone,
	"security_entered_by" integer,
	"loaded_at" timestamp with time zone,
	"loaded_by" integer,
	"security_exited_at" timestamp with time zone,
	"security_exited_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_trucks_quantity_check" CHECK ("order_trucks"."quantity" > 0 AND "order_trucks"."quantity" <= 60000)
);
--> statement-breakpoint
CREATE TABLE "offline_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_number" varchar(50) NOT NULL,
	"state" varchar(100) DEFAULT '',
	"location" varchar(255) DEFAULT '',
	"customer_name" varchar(255) DEFAULT '',
	"customer_phone" varchar(50) DEFAULT '',
	"total_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(15, 2) DEFAULT '0' NOT NULL,
	"payment_status" "order_payment_status" DEFAULT 'Unpaid' NOT NULL,
	"payment_bank" varchar(255) DEFAULT '',
	"payment_reference" varchar(255) DEFAULT '',
	"status" "offline_sale_status" DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"rejection_reason" text DEFAULT '',
	"reconciled" boolean DEFAULT false NOT NULL,
	"reconciled_by" integer,
	"reconciled_at" timestamp with time zone,
	"notes" text DEFAULT '',
	"created_by" integer,
	"created_by_name" varchar(255) DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_sales_amounts_check" CHECK ("offline_sales"."total_amount" >= 0 AND "offline_sales"."amount_paid" >= 0)
);
--> statement-breakpoint
CREATE TABLE "offline_sale_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"offline_sale_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"line_total" numeric(15, 2) NOT NULL,
	CONSTRAINT "offline_sale_items_quantity_check" CHECK ("offline_sale_items"."quantity" > 0),
	CONSTRAINT "offline_sale_items_price_check" CHECK ("offline_sale_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lpg_order_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_number" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"lpg_station_id" integer NOT NULL,
	"cylinder_size_kg" integer NOT NULL,
	"cylinder_quantity" integer NOT NULL,
	"delivery_address" text NOT NULL,
	"delivery_state" varchar(100) DEFAULT '',
	"delivery_lga" varchar(100) DEFAULT '',
	"status" varchar(30) DEFAULT 'Pending Review' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'Unpaid' NOT NULL,
	"collection_status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"price_per_kg" numeric(15, 2),
	"delivery_price" numeric(15, 2),
	"total_amount" numeric(15, 2),
	"expected_arrival_date" varchar(20),
	"payment_reference" varchar(100),
	"payment_mode" varchar(50),
	"virtual_account_number" varchar(30) DEFAULT '',
	"virtual_account_bank" varchar(100) DEFAULT '',
	"virtual_account_name" varchar(255) DEFAULT '',
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wa_phone" varchar(30) NOT NULL,
	"customer_id" integer,
	"state" "wa_session_state" DEFAULT 'MENU' NOT NULL,
	"cart" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_order_id" integer,
	"failure_count" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"wamid" varchar(128),
	"direction" "wa_message_direction" NOT NULL,
	"wa_phone" varchar(30) NOT NULL,
	"session_id" integer,
	"customer_id" integer,
	"in_reply_to" integer,
	"payload" jsonb NOT NULL,
	"status" "wa_message_status" NOT NULL,
	"error" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"category" varchar(40) DEFAULT '',
	"meta_status" "wa_template_status" DEFAULT 'pending' NOT NULL,
	"body" text DEFAULT '',
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_type" "principal_type" NOT NULL,
	"staff_id" integer,
	"customer_id" integer,
	"type" varchar(64) NOT NULL,
	"category" "notification_category" NOT NULL,
	"priority" "notification_priority" DEFAULT 'normal' NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"entity_type" varchar(64) DEFAULT '' NOT NULL,
	"entity_id" varchar(64) DEFAULT '' NOT NULL,
	"action_url" text,
	"image_url" text,
	"dedupe_key" varchar(160),
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_recipient_arc_check" CHECK (("notifications"."recipient_type" = 'staff'    AND "notifications"."staff_id"    IS NOT NULL AND "notifications"."customer_id" IS NULL)
       OR ("notifications"."recipient_type" = 'customer' AND "notifications"."customer_id" IS NOT NULL AND "notifications"."staff_id"    IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" integer,
	"principal_type" "principal_type",
	"staff_id" integer,
	"customer_id" integer,
	"type" varchar(64) NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"destination" varchar(255) DEFAULT '' NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_message_id" varchar(255) DEFAULT '' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"principal_type" "principal_type" NOT NULL,
	"staff_id" integer,
	"customer_id" integer,
	"category" "notification_category" NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"sms" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_principal_arc_check" CHECK (("notification_preferences"."principal_type" = 'staff'    AND "notification_preferences"."staff_id"    IS NOT NULL AND "notification_preferences"."customer_id" IS NULL)
       OR ("notification_preferences"."principal_type" = 'customer' AND "notification_preferences"."customer_id" IS NOT NULL AND "notification_preferences"."staff_id"    IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"principal_type" "principal_type" NOT NULL,
	"staff_id" integer,
	"customer_id" integer,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" smallint DEFAULT 1320 NOT NULL,
	"quiet_hours_end" smallint DEFAULT 420 NOT NULL,
	"timezone" varchar(64) DEFAULT '' NOT NULL,
	"locale" varchar(16) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_principal_arc_check" CHECK (("notification_settings"."principal_type" = 'staff'    AND "notification_settings"."staff_id"    IS NOT NULL AND "notification_settings"."customer_id" IS NULL)
       OR ("notification_settings"."principal_type" = 'customer' AND "notification_settings"."customer_id" IS NOT NULL AND "notification_settings"."staff_id"    IS NULL)),
	CONSTRAINT "notification_settings_quiet_hours_range_check" CHECK ("notification_settings"."quiet_hours_start" BETWEEN 0 AND 1439 AND "notification_settings"."quiet_hours_end" BETWEEN 0 AND 1439)
);
--> statement-breakpoint
CREATE TABLE "staff_page_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"route_path" varchar(100) NOT NULL,
	"allowed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"subject" varchar(200) DEFAULT '',
	"body" text NOT NULL,
	"channels" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."audit_events" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "sman"."audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"action" varchar(100) NOT NULL,
	"actor_type" "sman"."audit_actor_type" DEFAULT 'system' NOT NULL,
	"actor_id" integer,
	"actor_name" varchar(255) DEFAULT '',
	"entity_type" varchar(100) DEFAULT '',
	"entity_id" varchar(64) DEFAULT '',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."audit_logs" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "sman"."audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"prev_state" varchar(32),
	"new_state" varchar(32),
	"actor_type" "sman"."audit_actor_type" NOT NULL,
	"actor_staff_id" bigint,
	"actor_customer_id" bigint,
	"metadata" jsonb,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_arc_check" CHECK (("sman"."audit_logs"."actor_type" = 'staff'    AND "sman"."audit_logs"."actor_staff_id"    IS NOT NULL AND "sman"."audit_logs"."actor_customer_id" IS NULL)
       OR ("sman"."audit_logs"."actor_type" = 'customer' AND "sman"."audit_logs"."actor_customer_id" IS NOT NULL AND "sman"."audit_logs"."actor_staff_id"    IS NULL)
       OR ("sman"."audit_logs"."actor_type" = 'system'   AND "sman"."audit_logs"."actor_staff_id"    IS NULL     AND "sman"."audit_logs"."actor_customer_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sman"."bank_account_extras" (
	"bank_account_id" bigint PRIMARY KEY NOT NULL,
	"bank_code" varchar(50) DEFAULT '',
	"branch_name" varchar(150) DEFAULT '',
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"depot_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lpg_station_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"customer_id" bigint NOT NULL,
	"depot_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"commission_rate" numeric(15, 2) NOT NULL,
	"commission_amount" numeric(15, 2) NOT NULL,
	"status" "sman"."commission_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commissions_quantity_check" CHECK ("sman"."commissions"."quantity" > 0),
	CONSTRAINT "commissions_rate_check" CHECK ("sman"."commissions"."commission_rate" >= 0),
	CONSTRAINT "commissions_amount_check" CHECK ("sman"."commissions"."commission_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sman"."customer_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" bigint NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"order_id" bigint,
	"payment_record_id" bigint,
	"description" varchar(255) DEFAULT '',
	"reference" varchar(255) DEFAULT '',
	"notes" text DEFAULT '',
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."customer_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" bigint NOT NULL,
	"provider" "sman"."customer_identity_provider" NOT NULL,
	"provider_user_id" varchar(320) NOT NULL,
	"secret_hash" text,
	"verified" boolean DEFAULT false NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."customer_trusted_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" bigint NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"device_name" varchar(255) DEFAULT '',
	"user_agent" varchar(512) DEFAULT '',
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."customer_passkeys" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" bigint NOT NULL,
	"credential_id" varchar(512) NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" jsonb,
	"device_name" varchar(255) DEFAULT '',
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."webauthn_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" bigint,
	"purpose" varchar(20) NOT NULL,
	"challenge" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."customer_licenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" bigint NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"license_url" text DEFAULT '',
	"license_public_id" text DEFAULT '',
	"expiry_date" date,
	"status" "sman"."license_verification_status" DEFAULT 'pending' NOT NULL,
	"verified_by" bigint,
	"verified_by_name" varchar(255) DEFAULT '',
	"verified_at" timestamp with time zone,
	"verification_comment" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."customer_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" bigint NOT NULL,
	"purpose" varchar(32) DEFAULT 'auth' NOT NULL,
	"code_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"request_ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."daily_report_extras" (
	"report_id" bigint PRIMARY KEY NOT NULL,
	"report_type" varchar(30) DEFAULT 'sales_manager' NOT NULL,
	"product_name" varchar(100) DEFAULT '',
	"opening_stock" numeric(15, 2) DEFAULT '0',
	"received_stock" numeric(15, 2) DEFAULT '0',
	"avg_price" numeric(12, 2) DEFAULT '0',
	"yesterday_deficit_payment" numeric(15, 2) DEFAULT '0',
	"yesterday_surplus_payment" numeric(15, 2) DEFAULT '0',
	"total_inflow" numeric(15, 2) DEFAULT '0',
	"trucks_entered" integer,
	"customer_count" integer,
	"order_count" integer,
	"rates" text DEFAULT '',
	"top_customers" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'submitted' NOT NULL,
	"reviewed_by" bigint,
	"reviewed_by_name" varchar(255) DEFAULT '',
	"reviewed_at" timestamp with time zone,
	"review_comment" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."dangote_order_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_number" varchar(50) NOT NULL,
	"customer_id" bigint NOT NULL,
	"company_name" varchar(255) DEFAULT '',
	"license_id" bigint,
	"product" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"quantity_unit" varchar(20) DEFAULT 'Tons' NOT NULL,
	"delivery_address" text NOT NULL,
	"delivery_state" varchar(100) DEFAULT '',
	"delivery_lga" varchar(100) DEFAULT '',
	"status" varchar(30) DEFAULT 'Pending Review' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'Unpaid' NOT NULL,
	"collection_status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"price_per_unit" numeric(15, 2),
	"delivery_price" numeric(15, 2),
	"total_amount" numeric(15, 2),
	"expected_arrival_date" varchar(20),
	"payment_reference" varchar(100),
	"payment_mode" varchar(50),
	"virtual_account_number" varchar(30) DEFAULT '',
	"virtual_account_bank" varchar(100) DEFAULT '',
	"virtual_account_name" varchar(255) DEFAULT '',
	"reviewed_by" bigint,
	"reviewed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."dangote_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(50) NOT NULL,
	"category" varchar(100) NOT NULL,
	"unit" varchar(30) DEFAULT 'Tons' NOT NULL,
	"description" text DEFAULT '',
	"plants" text DEFAULT '[]' NOT NULL,
	"status" varchar(20) DEFAULT 'Active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."delivery_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_note_number" varchar(50) NOT NULL,
	"customer_id" bigint NOT NULL,
	"customer_type_snapshot" "sman"."delivery_customer_type" NOT NULL,
	"order_id" bigint,
	"delivery_address" text NOT NULL,
	"contact_person_on_site" jsonb DEFAULT '{}'::jsonb,
	"product" varchar(255) NOT NULL,
	"quantity_delivered" real NOT NULL,
	"unit" varchar(30) DEFAULT 'Liters',
	"driver" jsonb DEFAULT '{}'::jsonb,
	"truck" jsonb DEFAULT '{}'::jsonb,
	"depot_of_loading" varchar(255) DEFAULT '',
	"dispatch_date" timestamp with time zone DEFAULT now(),
	"expected_delivery_date" timestamp with time zone,
	"status" "sman"."delivery_note_status" DEFAULT 'Pending' NOT NULL,
	"remarks" text DEFAULT '',
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_notes_qty_check" CHECK ("sman"."delivery_notes"."quantity_delivered" > 0)
);
--> statement-breakpoint
CREATE TABLE "sman"."depot_extras" (
	"depot_id" bigint PRIMARY KEY NOT NULL,
	"code" varchar(50),
	"address" text DEFAULT '',
	"city" varchar(100) DEFAULT '',
	"state" varchar(100) DEFAULT '',
	"country" varchar(100) DEFAULT '',
	"postcode" varchar(20) DEFAULT '',
	"parked_trucks_count" integer DEFAULT 0 NOT NULL,
	"max_capacity" integer,
	"status" varchar(20) DEFAULT 'Active' NOT NULL,
	"established_year" varchar(10) DEFAULT '',
	"paystack_subaccount_code" varchar(100) DEFAULT '',
	"subaccount_active" boolean DEFAULT false NOT NULL,
	"subaccount_split_percentage" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depot_extras_parked_trucks_check" CHECK ("sman"."depot_extras"."parked_trucks_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sman"."depot_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_product_price_id" bigint NOT NULL,
	"price" numeric(15, 2) NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."depot_product_capacities" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depot_product_cap_check" CHECK ("sman"."depot_product_capacities"."capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sman"."depot_product_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"commission_rate" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depot_product_commission_rate_check" CHECK ("sman"."depot_product_commissions"."commission_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sman"."depot_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_id" bigint NOT NULL,
	"staff_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"principal_type" "sman"."principal_type" NOT NULL,
	"staff_id" bigint,
	"customer_id" bigint,
	"token" text NOT NULL,
	"provider" varchar(16) DEFAULT 'fcm' NOT NULL,
	"platform" "sman"."device_token_platform" NOT NULL,
	"device_id" varchar(128) DEFAULT '' NOT NULL,
	"device_name" varchar(255) DEFAULT '' NOT NULL,
	"app_version" varchar(32) DEFAULT '' NOT NULL,
	"locale" varchar(16) DEFAULT '' NOT NULL,
	"timezone" varchar(64) DEFAULT '' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_reason" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_principal_arc_check" CHECK (("sman"."device_tokens"."principal_type" = 'staff'    AND "sman"."device_tokens"."staff_id"    IS NOT NULL AND "sman"."device_tokens"."customer_id" IS NULL)
       OR ("sman"."device_tokens"."principal_type" = 'customer' AND "sman"."device_tokens"."customer_id" IS NOT NULL AND "sman"."device_tokens"."staff_id"    IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sman"."drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) DEFAULT '',
	"phone" varchar(30) NOT NULL,
	"license_number" varchar(100) NOT NULL,
	"license_class" varchar(50) NOT NULL,
	"rating" real DEFAULT 0,
	"status" "sman"."driver_status" DEFAULT 'Active' NOT NULL,
	"assigned_truck_ref" integer,
	"safety_score" integer DEFAULT 0,
	"license_expiry" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_rating_check" CHECK ("sman"."drivers"."rating" >= 0 AND "sman"."drivers"."rating" <= 5),
	CONSTRAINT "drivers_safety_score_check" CHECK ("sman"."drivers"."safety_score" >= 0 AND "sman"."drivers"."safety_score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "sman"."driver_truck_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer NOT NULL,
	"truck_id" bigint NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."expected_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" bigint NOT NULL,
	"order_id" bigint,
	"depot_id" bigint,
	"pfi_id" bigint,
	"expected_amount" numeric(15, 2),
	"reference" varchar(255) DEFAULT '',
	"note" text DEFAULT '',
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"matched_deposit_id" bigint,
	"created_by" bigint,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."expense_category_extras" (
	"category_id" bigint PRIMARY KEY NOT NULL,
	"gl_code" varchar(20),
	"gl_group" varchar(40),
	"gl_subgroup" varchar(60) DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."truck_extras" (
	"truck_id" bigint PRIMARY KEY NOT NULL,
	"vin" varchar(50) DEFAULT '',
	"year" integer,
	"truck_type" varchar(50) DEFAULT '',
	"fuel_level" integer DEFAULT 100,
	"registration_expiry" date,
	"next_service_mileage" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"principal_type" "sman"."principal_type" NOT NULL,
	"staff_id" bigint,
	"customer_id" bigint,
	"refresh_token_hash" char(64) NOT NULL,
	"family_id" uuid NOT NULL,
	"replaced_by_id" bigint,
	"revoked_reason" varchar(32),
	"device_name" varchar(255) DEFAULT '',
	"user_agent" text,
	"ip_address" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_principal_arc_check" CHECK (("sman"."sessions"."principal_type" = 'staff'    AND "sman"."sessions"."staff_id"    IS NOT NULL AND "sman"."sessions"."customer_id" IS NULL)
       OR ("sman"."sessions"."principal_type" = 'customer' AND "sman"."sessions"."customer_id" IS NOT NULL AND "sman"."sessions"."staff_id"    IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sman"."lpg_station_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"lpg_station_id" bigint NOT NULL,
	"staff_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."pfi_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"pfi_id" bigint NOT NULL,
	"staff_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."wallet_holds" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"status" "sman"."wallet_hold_status" DEFAULT 'active' NOT NULL,
	"description" text DEFAULT '',
	"deposit_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "wallet_holds_amount_check" CHECK ("sman"."wallet_holds"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "sman"."webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "sman"."webhook_status" DEFAULT 'pending' NOT NULL,
	"error" text DEFAULT '',
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."order_deposit_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"deposit_id" bigint NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."order_idempotency" (
	"id" serial PRIMARY KEY NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"order_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_person" varchar(255) DEFAULT '',
	"phone" varchar(50) DEFAULT '',
	"email" varchar(255) DEFAULT '',
	"address" text DEFAULT '',
	"bank_name" varchar(200) DEFAULT '',
	"account_number" varchar(50) DEFAULT '',
	"account_name" varchar(255) DEFAULT '',
	"tax_id" varchar(50) DEFAULT '',
	"status" varchar(20) DEFAULT 'Active' NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."pfi_expense_extras" (
	"expense_id" bigint PRIMARY KEY NOT NULL,
	"vendor_id" bigint,
	"tin_number" varchar(30) DEFAULT '',
	"invoice_number" varchar(100) DEFAULT '',
	"amount_ex_vat" numeric(15, 2),
	"vat_amount" numeric(15, 2),
	"invoice_amount" numeric(15, 2),
	"wht_deduction" numeric(15, 2),
	"wht_rate" numeric(5, 2),
	"bank_code" varchar(20) DEFAULT '',
	"payment_reference" varchar(100) DEFAULT '',
	"payment_date" timestamp with time zone,
	"payment_method" varchar(30) DEFAULT '',
	"payment_notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."pfi_expense_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" bigint NOT NULL,
	"body" text NOT NULL,
	"author_id" bigint,
	"author_name" varchar(255) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."lpg_station_cylinders" (
	"id" serial PRIMARY KEY NOT NULL,
	"lpg_station_id" bigint NOT NULL,
	"cylinder_size_kg" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lpg_station_cylinders_size_check" CHECK ("sman"."lpg_station_cylinders"."cylinder_size_kg" >= 1),
	CONSTRAINT "lpg_station_cylinders_qty_check" CHECK ("sman"."lpg_station_cylinders"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "sman"."lpg_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"lpg_station_id" bigint NOT NULL,
	"price_per_kg" numeric(15, 2) NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."lpg_station_extras" (
	"lpg_station_id" bigint PRIMARY KEY NOT NULL,
	"address" text DEFAULT '',
	"city" varchar(100) DEFAULT '',
	"state" varchar(100) DEFAULT '',
	"country" varchar(100) DEFAULT '',
	"postcode" varchar(20) DEFAULT '',
	"established_year" varchar(10) DEFAULT '',
	"paystack_subaccount_code" varchar(100) DEFAULT '',
	"subaccount_active" boolean DEFAULT false NOT NULL,
	"subaccount_split_percentage" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."lpg_order_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_number" varchar(50) NOT NULL,
	"customer_id" bigint NOT NULL,
	"company_name" varchar(255) DEFAULT '',
	"lpg_station_id" bigint,
	"cylinder_size_kg" integer NOT NULL,
	"cylinder_quantity" integer NOT NULL,
	"delivery_address" text NOT NULL,
	"delivery_state" varchar(100) DEFAULT '',
	"delivery_lga" varchar(100) DEFAULT '',
	"status" varchar(30) DEFAULT 'Pending Review' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'Unpaid' NOT NULL,
	"collection_status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"price_per_kg" numeric(15, 2),
	"delivery_price" numeric(15, 2),
	"total_amount" numeric(15, 2),
	"expected_arrival_date" varchar(20),
	"payment_reference" varchar(100),
	"payment_mode" varchar(50),
	"virtual_account_number" varchar(30) DEFAULT '',
	"virtual_account_bank" varchar(100) DEFAULT '',
	"virtual_account_name" varchar(255) DEFAULT '',
	"reviewed_by" bigint,
	"reviewed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."staff_page_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" bigint NOT NULL,
	"route_path" varchar(100) NOT NULL,
	"allowed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."staff_password_resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" bigint NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_type" "sman"."principal_type" NOT NULL,
	"staff_id" bigint,
	"customer_id" bigint,
	"type" varchar(64) NOT NULL,
	"category" "sman"."notification_category" NOT NULL,
	"priority" "sman"."notification_priority" DEFAULT 'normal' NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"entity_type" varchar(64) DEFAULT '' NOT NULL,
	"entity_id" varchar(64) DEFAULT '' NOT NULL,
	"action_url" text,
	"image_url" text,
	"dedupe_key" varchar(160),
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_recipient_arc_check" CHECK (("sman"."notifications"."recipient_type" = 'staff'    AND "sman"."notifications"."staff_id"    IS NOT NULL AND "sman"."notifications"."customer_id" IS NULL)
       OR ("sman"."notifications"."recipient_type" = 'customer' AND "sman"."notifications"."customer_id" IS NOT NULL AND "sman"."notifications"."staff_id"    IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sman"."notification_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" bigint,
	"principal_type" "sman"."principal_type",
	"staff_id" integer,
	"customer_id" integer,
	"type" varchar(64) NOT NULL,
	"channel" "sman"."notification_channel" NOT NULL,
	"destination" varchar(255) DEFAULT '' NOT NULL,
	"status" "sman"."notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_message_id" varchar(255) DEFAULT '' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"principal_type" "sman"."principal_type" NOT NULL,
	"staff_id" bigint,
	"customer_id" bigint,
	"category" "sman"."notification_category" NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"sms" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_principal_arc_check" CHECK (("sman"."notification_preferences"."principal_type" = 'staff'    AND "sman"."notification_preferences"."staff_id"    IS NOT NULL AND "sman"."notification_preferences"."customer_id" IS NULL)
       OR ("sman"."notification_preferences"."principal_type" = 'customer' AND "sman"."notification_preferences"."customer_id" IS NOT NULL AND "sman"."notification_preferences"."staff_id"    IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sman"."notification_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"principal_type" "sman"."principal_type" NOT NULL,
	"staff_id" bigint,
	"customer_id" bigint,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" smallint DEFAULT 1320 NOT NULL,
	"quiet_hours_end" smallint DEFAULT 420 NOT NULL,
	"timezone" varchar(64) DEFAULT '' NOT NULL,
	"locale" varchar(16) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_principal_arc_check" CHECK (("sman"."notification_settings"."principal_type" = 'staff'    AND "sman"."notification_settings"."staff_id"    IS NOT NULL AND "sman"."notification_settings"."customer_id" IS NULL)
       OR ("sman"."notification_settings"."principal_type" = 'customer' AND "sman"."notification_settings"."customer_id" IS NOT NULL AND "sman"."notification_settings"."staff_id"    IS NULL)),
	CONSTRAINT "notification_settings_quiet_hours_range_check" CHECK ("sman"."notification_settings"."quiet_hours_start" BETWEEN 0 AND 1439 AND "sman"."notification_settings"."quiet_hours_end" BETWEEN 0 AND 1439)
);
--> statement-breakpoint
CREATE TABLE "sman"."message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"subject" varchar(200) DEFAULT '',
	"body" text NOT NULL,
	"channels" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."wa_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wa_phone" varchar(30) NOT NULL,
	"customer_id" bigint,
	"state" "sman"."wa_session_state" DEFAULT 'MENU' NOT NULL,
	"cart" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_order_id" bigint,
	"failure_count" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."wa_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"wamid" varchar(128),
	"direction" "sman"."wa_message_direction" NOT NULL,
	"wa_phone" varchar(30) NOT NULL,
	"session_id" integer,
	"customer_id" bigint,
	"in_reply_to" integer,
	"payload" jsonb NOT NULL,
	"status" "sman"."wa_message_status" NOT NULL,
	"error" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sman"."wa_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"category" varchar(40) DEFAULT '',
	"meta_status" "sman"."wa_template_status" DEFAULT 'pending' NOT NULL,
	"body" text DEFAULT '',
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "administration_confirmrelease" ADD CONSTRAINT "administration_confi_order_id_4846adfb_fk_consumer_" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_confirmrelease" ADD CONSTRAINT "administration_confi_inventory_id_ec5e9266_fk_administr" FOREIGN KEY ("inventory_id") REFERENCES "public"."administration_deliveryinventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_dailyreportapproval" ADD CONSTRAINT "administration_daily_approved_by_id_1330bc97_fk_administr" FOREIGN KEY ("approved_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_deliveryinventory" ADD CONSTRAINT "administration_deliv_customer_id_395575a8_fk_administr" FOREIGN KEY ("customer_id") REFERENCES "public"."administration_deliverycustomer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_deliveryinventory" ADD CONSTRAINT "administration_deliv_truck_id_4a27f975_fk_consumer_" FOREIGN KEY ("truck_id") REFERENCES "public"."consumer_fleettruck"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_deliveryinventory" ADD CONSTRAINT "administration_deliv_pfi_id_932b9bd6_fk_consumer_" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_deliveryinventory_trucks" ADD CONSTRAINT "administration_deliv_deliveryinventory_id_919898f4_fk_administr" FOREIGN KEY ("deliveryinventory_id") REFERENCES "public"."administration_deliveryinventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_deliveryinventory_trucks" ADD CONSTRAINT "administration_deliv_fleettruck_id_f102cd04_fk_consumer_" FOREIGN KEY ("fleettruck_id") REFERENCES "public"."consumer_fleettruck"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_deliveryledgersettingsaudit" ADD CONSTRAINT "administration_deliv_settings_obj_id_75295e60_fk_delivery_" FOREIGN KEY ("settings_obj_id") REFERENCES "public"."delivery_ledger_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_deliveryledgersettingsaudit" ADD CONSTRAINT "administration_deliv_updated_by_id_d50bd58b_fk_administr" FOREIGN KEY ("updated_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_deliverysale" ADD CONSTRAINT "administration_deliv_customer_id_235d2c38_fk_administr" FOREIGN KEY ("customer_id") REFERENCES "public"."administration_deliverycustomer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_offlinesales" ADD CONSTRAINT "administration_offli_state_id_1e65a692_fk_consumer_" FOREIGN KEY ("state_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_offlinesalesproduct" ADD CONSTRAINT "administration_offli_offline_id_8f4058e0_fk_administr" FOREIGN KEY ("offline_id") REFERENCES "public"."administration_offlinesales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_offlinesalesproduct" ADD CONSTRAINT "administration_offli_product_id_56de22b3_fk_consumer_" FOREIGN KEY ("product_id") REFERENCES "public"."consumer_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_offlinesales_trucks" ADD CONSTRAINT "administration_offli_offlinesales_id_3680edb5_fk_administr" FOREIGN KEY ("offlinesales_id") REFERENCES "public"."administration_offlinesales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_offlinesales_trucks" ADD CONSTRAINT "administration_offli_truck_id_b7951bfa_fk_consumer_" FOREIGN KEY ("truck_id") REFERENCES "public"."consumer_truck"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_record" ADD CONSTRAINT "administration_recor_submitted_by_id_bf85d70b_fk_administr" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_record" ADD CONSTRAINT "administration_recor_reviewed_by_id_21c842b0_fk_administr" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_staffdailysalesreport" ADD CONSTRAINT "administration_staff_submitted_by_id_fdc20360_fk_administr" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_filling_stations" ADD CONSTRAINT "administration_user__user_id_93c3fbe9_fk_administr" FOREIGN KEY ("user_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_filling_stations" ADD CONSTRAINT "administration_user__deliverycustomer_id_9b285a15_fk_administr" FOREIGN KEY ("deliverycustomer_id") REFERENCES "public"."administration_deliverycustomer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_groups" ADD CONSTRAINT "administration_user__user_id_fcbab611_fk_administr" FOREIGN KEY ("user_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_groups" ADD CONSTRAINT "administration_user_groups_group_id_43b1e17e_fk_auth_group_id" FOREIGN KEY ("group_id") REFERENCES "public"."auth_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_locations" ADD CONSTRAINT "administration_user__states_id_ff603b53_fk_consumer_" FOREIGN KEY ("states_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_locations" ADD CONSTRAINT "administration_user__user_id_89ab3271_fk_administr" FOREIGN KEY ("user_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_lpg_plants" ADD CONSTRAINT "administration_user__user_id_18fb1020_fk_administr" FOREIGN KEY ("user_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_lpg_plants" ADD CONSTRAINT "administration_user__lpgplant_id_e16ceee4_fk_consumer_" FOREIGN KEY ("lpgplant_id") REFERENCES "public"."consumer_lpgplant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_pfis" ADD CONSTRAINT "administration_user__user_id_044ba9d7_fk_administr" FOREIGN KEY ("user_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_pfis" ADD CONSTRAINT "administration_user_pfis_pfi_id_de6488cf_fk_consumer_pfi_id" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_usertoken" ADD CONSTRAINT "administration_usert_user_id_bec07dde_fk_administr" FOREIGN KEY ("user_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_user_permissions" ADD CONSTRAINT "administration_user__user_id_69e83b80_fk_administr" FOREIGN KEY ("user_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_user_user_permissions" ADD CONSTRAINT "administration_user__permission_id_5b940bd2_fk_auth_perm" FOREIGN KEY ("permission_id") REFERENCES "public"."auth_permission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_customer_id_customers_id_fk" FOREIGN KEY ("actor_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_group_permissions" ADD CONSTRAINT "auth_group_permissio_permission_id_84c5c92e_fk_auth_perm" FOREIGN KEY ("permission_id") REFERENCES "public"."auth_permission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_group_permissions" ADD CONSTRAINT "auth_group_permissions_group_id_b120cbf9_fk_auth_group_id" FOREIGN KEY ("group_id") REFERENCES "public"."auth_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_permission" ADD CONSTRAINT "auth_permission_content_type_id_2f476e4b_fk_django_co" FOREIGN KEY ("content_type_id") REFERENCES "public"."django_content_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authtoken_token" ADD CONSTRAINT "authtoken_token_user_id_35299eff_fk_administration_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_groups" ADD CONSTRAINT "auth_user_groups_group_id_97559544_fk_auth_group_id" FOREIGN KEY ("group_id") REFERENCES "public"."auth_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_groups" ADD CONSTRAINT "auth_user_groups_user_id_6a12ed8b_fk_auth_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_user_permissions" ADD CONSTRAINT "auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm" FOREIGN KEY ("permission_id") REFERENCES "public"."auth_permission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_user_permissions" ADD CONSTRAINT "auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_column_mappings" ADD CONSTRAINT "bank_statement_column_mappings_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_paid_by_staff_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD CONSTRAINT "customer_licenses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD CONSTRAINT "customer_licenses_verified_by_staff_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_agent" ADD CONSTRAINT "consumer_agent_location_id_81f36b58_fk_consumer_states_id" FOREIGN KEY ("location_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_auditlog" ADD CONSTRAINT "consumer_auditlog_actor_id_fa079501_fk_administration_user_id" FOREIGN KEY ("actor_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_auditlog" ADD CONSTRAINT "consumer_auditlog_order_id_dc6c79ae_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankacct" ADD CONSTRAINT "consumer_bankacct_location_id_9cc0b835_fk_consumer_states_id" FOREIGN KEY ("location_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankacct" ADD CONSTRAINT "consumer_bankacct_pfi_id_386c609a_fk_consumer_pfi_id" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankstatement" ADD CONSTRAINT "consumer_bankstateme_bank_account_id_2c8407c0_fk_consumer_" FOREIGN KEY ("bank_account_id") REFERENCES "public"."consumer_bankacct"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankstatement" ADD CONSTRAINT "consumer_bankstateme_uploaded_by_id_ebed2fb2_fk_administr" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankstatementcolumnmapping" ADD CONSTRAINT "consumer_bankstateme_bank_account_id_7a1aebf2_fk_consumer_" FOREIGN KEY ("bank_account_id") REFERENCES "public"."consumer_bankacct"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankstatementcolumnmapping" ADD CONSTRAINT "consumer_bankstateme_created_by_id_5146d134_fk_administr" FOREIGN KEY ("created_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankstatementline" ADD CONSTRAINT "consumer_bankstateme_bank_account_id_2f7ac500_fk_consumer_" FOREIGN KEY ("bank_account_id") REFERENCES "public"."consumer_bankacct"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankstatementline" ADD CONSTRAINT "consumer_bankstateme_matched_by_id_605ad10f_fk_administr" FOREIGN KEY ("matched_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankstatementline" ADD CONSTRAINT "consumer_bankstateme_matched_order_id_b2520e81_fk_consumer_" FOREIGN KEY ("matched_order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankstatementline" ADD CONSTRAINT "consumer_bankstateme_matched_payment_reco_b2f56ecb_fk_consumer_" FOREIGN KEY ("matched_payment_record_id") REFERENCES "public"."consumer_orderpaymentrecord"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_bankstatementline" ADD CONSTRAINT "consumer_bankstateme_statement_id_13b4c42e_fk_consumer_" FOREIGN KEY ("statement_id") REFERENCES "public"."consumer_bankstatement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_deliveryorders" ADD CONSTRAINT "consumer_deliveryord_delivery_state_id_44ba3748_fk_consumer_" FOREIGN KEY ("delivery_state_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_deliveryorders" ADD CONSTRAINT "consumer_deliveryorders_order_id_b9c187e7_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_expensecategory" ADD CONSTRAINT "consumer_expensecategory_pfi_id_7ce97f76_fk_consumer_pfi_id" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_fleetledgerentry" ADD CONSTRAINT "consumer_fleetledger_truck_id_b9b435d2_fk_consumer_" FOREIGN KEY ("truck_id") REFERENCES "public"."consumer_fleettruck"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_locationcommissionrate" ADD CONSTRAINT "consumer_locationcom_location_id_aef2c6fe_fk_consumer_" FOREIGN KEY ("location_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_locationcommissionrate" ADD CONSTRAINT "consumer_locationcom_updated_by_id_3f821a33_fk_administr" FOREIGN KEY ("updated_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_lpgplant" ADD CONSTRAINT "consumer_lpgplant_location_id_28f59289_fk_consumer_states_id" FOREIGN KEY ("location_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_lpgsale" ADD CONSTRAINT "consumer_lpgsale_cashier_id_309419be_fk_administration_user_id" FOREIGN KEY ("cashier_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_lpgsale" ADD CONSTRAINT "consumer_lpgsale_plant_id_d1f1981c_fk_consumer_lpgplant_id" FOREIGN KEY ("plant_id") REFERENCES "public"."consumer_lpgplant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_lpgstockentry" ADD CONSTRAINT "consumer_lpgstockent_plant_id_76489617_fk_consumer_" FOREIGN KEY ("plant_id") REFERENCES "public"."consumer_lpgplant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_lpgstockentry" ADD CONSTRAINT "consumer_lpgstockent_recorded_by_id_8df38296_fk_administr" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_payment_confirmed_by_36029149_fk_administr" FOREIGN KEY ("payment_confirmed_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_released_by_id_3906dd7b_fk_administr" FOREIGN KEY ("released_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_security_exited_by_i_78c96a5f_fk_administr" FOREIGN KEY ("security_exited_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_user_id_81684fac_fk_consumer_customer_id" FOREIGN KEY ("user_id") REFERENCES "public"."consumer_customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_state_id_5cb2f2ef_fk_consumer_states_id" FOREIGN KEY ("state_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_assigned_agent_id_85f408a3_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."consumer_agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_pfi_id_97a6b8c4_fk_consumer_pfi_id" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_ticket_generated_by__45b2448b_fk_administr" FOREIGN KEY ("ticket_generated_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_commission_paid_by_i_30ee53ab_fk_administr" FOREIGN KEY ("commission_paid_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_order" ADD CONSTRAINT "consumer_order_security_entered_by__e0678ae8_fk_administr" FOREIGN KEY ("security_entered_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderauditevent" ADD CONSTRAINT "consumer_orderauditevent_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderauditevent" ADD CONSTRAINT "consumer_orderaudite_actor_user_id_76dca81c_fk_administr" FOREIGN KEY ("actor_user_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderpaymentinfo" ADD CONSTRAINT "consumer_orderpaymen_bank_account_id_faab00d8_fk_consumer_" FOREIGN KEY ("bank_account_id") REFERENCES "public"."consumer_bankacct"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderpaymentinfo" ADD CONSTRAINT "consumer_orderpaymen_order_id_3803ba7a_fk_consumer_" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderpaymentinfo" ADD CONSTRAINT "consumer_orderpaymen_payment_channel_id_f3fe2953_fk_consumer_" FOREIGN KEY ("payment_channel_id") REFERENCES "public"."consumer_paymentchannels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderpaymentrecord" ADD CONSTRAINT "consumer_orderpaymen_bank_account_id_bdb936a0_fk_consumer_" FOREIGN KEY ("bank_account_id") REFERENCES "public"."consumer_bankacct"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderpaymentrecord" ADD CONSTRAINT "consumer_orderpaymen_created_by_id_2a9cfe40_fk_administr" FOREIGN KEY ("created_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderpaymentrecord" ADD CONSTRAINT "consumer_orderpaymen_order_id_0eab3d95_fk_consumer_" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderproduct" ADD CONSTRAINT "consumer_orderproduc_product_id_0491d358_fk_consumer_" FOREIGN KEY ("product_id") REFERENCES "public"."consumer_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_orderproduct" ADD CONSTRAINT "consumer_orderproduct_order_id_1e96a268_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_overpaymenttransferrequest" ADD CONSTRAINT "consumer_overpayment_requested_by_id_25e75012_fk_administr" FOREIGN KEY ("requested_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_overpaymenttransferrequest" ADD CONSTRAINT "consumer_overpayment_reviewed_by_id_59c5c526_fk_administr" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_overpaymenttransferrequest" ADD CONSTRAINT "consumer_overpayment_source_order_id_19f1a44c_fk_consumer_" FOREIGN KEY ("source_order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_overpaymenttransferrequest" ADD CONSTRAINT "consumer_overpayment_target_order_id_2a3a55f2_fk_consumer_" FOREIGN KEY ("target_order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_paymentfile" ADD CONSTRAINT "consumer_paymentfile_order_id_cdd06dcb_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_paymentsplit" ADD CONSTRAINT "consumer_paymentsplit_order_id_7a2d67d1_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_created_by_id_a9ca7415_fk_administration_user_id" FOREIGN KEY ("created_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_location_id_53c8a6ed_fk_consumer_states_id" FOREIGN KEY ("location_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_product_id_bad0bf45_fk_consumer_product_id" FOREIGN KEY ("product_id") REFERENCES "public"."consumer_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_finance_person_id_9c92e0d5_fk_administr" FOREIGN KEY ("finance_person_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_marketing_person_id_ca514db6_fk_administr" FOREIGN KEY ("marketing_person_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_audit_officer_id_92963914_fk_administr" FOREIGN KEY ("audit_officer_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_product_officer_id_8fb6de1d_fk_administr" FOREIGN KEY ("product_officer_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_it_compliance_office_adacca23_fk_administr" FOREIGN KEY ("it_compliance_officer_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_security_exit_office_55bcda50_fk_administr" FOREIGN KEY ("security_exit_officer_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_commission_officer_i_b955bccd_fk_administr" FOREIGN KEY ("commission_officer_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi" ADD CONSTRAINT "consumer_pfi_sales_manager_id_49b824fc_fk_administr" FOREIGN KEY ("sales_manager_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi_allowed_locations" ADD CONSTRAINT "consumer_pfi_allowed_pfi_id_1b1283ab_fk_consumer_" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfi_allowed_locations" ADD CONSTRAINT "consumer_pfi_allowed_states_id_e5116c02_fk_consumer_" FOREIGN KEY ("states_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpense" ADD CONSTRAINT "consumer_pfiexpense_added_by_id_f696ea64_fk_administr" FOREIGN KEY ("added_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpense" ADD CONSTRAINT "consumer_pfiexpense_edited_by_id_31e459f0_fk_administr" FOREIGN KEY ("edited_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpense" ADD CONSTRAINT "consumer_pfiexpense_category_id_9a9007f2_fk_consumer_" FOREIGN KEY ("category_id") REFERENCES "public"."consumer_expensecategory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpense" ADD CONSTRAINT "consumer_pfiexpense_pfi_id_398caccb_fk_consumer_pfi_id" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpense" ADD CONSTRAINT "consumer_pfiexpense_reviewed_by_id_0cdae3e9_fk_administr" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpense" ADD CONSTRAINT "consumer_pfiexpense_admin_approved_by_id_ddaea4f9_fk_administr" FOREIGN KEY ("admin_approved_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpense" ADD CONSTRAINT "consumer_pfiexpense_audit_approved_by_id_03b97dd5_fk_administr" FOREIGN KEY ("audit_approved_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpense" ADD CONSTRAINT "consumer_pfiexpense_paid_by_id_8c44101d_fk_administr" FOREIGN KEY ("paid_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpense" ADD CONSTRAINT "consumer_pfiexpense_verified_by_id_fb7c8e9a_fk_administr" FOREIGN KEY ("verified_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpenseattachment" ADD CONSTRAINT "consumer_pfiexpensea_expense_id_a4da6eae_fk_consumer_" FOREIGN KEY ("expense_id") REFERENCES "public"."consumer_pfiexpense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpenseattachment" ADD CONSTRAINT "consumer_pfiexpensea_uploaded_by_id_a1f0da1d_fk_administr" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpenseaudit" ADD CONSTRAINT "consumer_pfiexpensea_expense_id_11474495_fk_consumer_" FOREIGN KEY ("expense_id") REFERENCES "public"."consumer_pfiexpense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfiexpenseaudit" ADD CONSTRAINT "consumer_pfiexpensea_performed_by_id_52a514fe_fk_administr" FOREIGN KEY ("performed_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfimovement" ADD CONSTRAINT "consumer_pfimovement_order_id_e5c957e2_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfimovement" ADD CONSTRAINT "consumer_pfimovement_pfi_id_05fbfca2_fk_consumer_pfi_id" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pfimovement" ADD CONSTRAINT "consumer_pfimovement_user_id_7e293198_fk_administration_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pickuporders" ADD CONSTRAINT "consumer_pickuporders_order_id_56c89f68_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pickuporders" ADD CONSTRAINT "consumer_pickuporders_state_id_e6380670_fk_consumer_states_id" FOREIGN KEY ("state_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pickuptruck" ADD CONSTRAINT "consumer_pickuptruck_pickup_order_id_65bbd981_fk_consumer_" FOREIGN KEY ("pickup_order_id") REFERENCES "public"."consumer_pickuporders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_productprice" ADD CONSTRAINT "consumer_productpric_product_id_af686dda_fk_consumer_" FOREIGN KEY ("product_id") REFERENCES "public"."consumer_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_productprice" ADD CONSTRAINT "consumer_productprice_state_id_38860880_fk_consumer_states_id" FOREIGN KEY ("state_id") REFERENCES "public"."consumer_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_truckallocation" ADD CONSTRAINT "consumer_truckallocation_order_id_bfa195b5_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_truckallocation" ADD CONSTRAINT "consumer_truckalloca_order_product_id_ac4fe6c0_fk_consumer_" FOREIGN KEY ("order_product_id") REFERENCES "public"."consumer_orderproduct"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_truckbreakdown" ADD CONSTRAINT "consumer_truckbreakdown_order_id_32028343_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_truckticket" ADD CONSTRAINT "consumer_truckticket_order_id_5ef9cb8d_fk_consumer_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_truckticket" ADD CONSTRAINT "consumer_truckticket_exited_by_id_78440475_fk_administr" FOREIGN KEY ("exited_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_truckticket" ADD CONSTRAINT "consumer_truckticket_entered_by_id_cdaa061c_fk_administr" FOREIGN KEY ("entered_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_trusted_devices" ADD CONSTRAINT "customer_trusted_devices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_passkeys" ADD CONSTRAINT "customer_passkeys_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_otps" ADD CONSTRAINT "customer_otps_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_submitted_by_staff_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dangote_order_requests" ADD CONSTRAINT "dangote_order_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dangote_order_requests" ADD CONSTRAINT "dangote_order_requests_license_id_customer_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."customer_licenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dangote_order_requests" ADD CONSTRAINT "dangote_order_requests_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_customers" ADD CONSTRAINT "delivery_customers_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_inventory" ADD CONSTRAINT "delivery_inventory_truck_id_fleet_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."fleet_trucks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_inventory" ADD CONSTRAINT "delivery_inventory_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_inventory" ADD CONSTRAINT "delivery_inventory_customer_id_delivery_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."delivery_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_ledger_settings" ADD CONSTRAINT "delivery_ledger_sett_updated_by_id_1239fc6a_fk_administr" FOREIGN KEY ("updated_by_id") REFERENCES "public"."administration_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_customer_id_delivery_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."delivery_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_sales" ADD CONSTRAINT "delivery_sales_customer_id_delivery_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."delivery_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_recorded_by_staff_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_price_history" ADD CONSTRAINT "depot_price_history_depot_product_price_id_depot_product_prices_id_fk" FOREIGN KEY ("depot_product_price_id") REFERENCES "public"."depot_product_prices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_product_capacities" ADD CONSTRAINT "depot_product_capacities_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_product_capacities" ADD CONSTRAINT "depot_product_capacities_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_product_commissions" ADD CONSTRAINT "depot_product_commissions_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_product_commissions" ADD CONSTRAINT "depot_product_commissions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_product_prices" ADD CONSTRAINT "depot_product_prices_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_product_prices" ADD CONSTRAINT "depot_product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_staff" ADD CONSTRAINT "depot_staff_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_staff" ADD CONSTRAINT "depot_staff_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "django_admin_log" ADD CONSTRAINT "django_admin_log_content_type_id_c4bce8eb_fk_django_co" FOREIGN KEY ("content_type_id") REFERENCES "public"."django_content_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "django_admin_log" ADD CONSTRAINT "django_admin_log_user_id_c564eba6_fk_auth_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "django_celery_beat_periodictask" ADD CONSTRAINT "django_celery_beat_p_crontab_id_d3cba168_fk_django_ce" FOREIGN KEY ("crontab_id") REFERENCES "public"."django_celery_beat_crontabschedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "django_celery_beat_periodictask" ADD CONSTRAINT "django_celery_beat_p_interval_id_a8ca27da_fk_django_ce" FOREIGN KEY ("interval_id") REFERENCES "public"."django_celery_beat_intervalschedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "django_celery_beat_periodictask" ADD CONSTRAINT "django_celery_beat_p_solar_id_a87ce72c_fk_django_ce" FOREIGN KEY ("solar_id") REFERENCES "public"."django_celery_beat_solarschedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "django_celery_beat_periodictask" ADD CONSTRAINT "django_celery_beat_p_clocked_id_47a69f82_fk_django_ce" FOREIGN KEY ("clocked_id") REFERENCES "public"."django_celery_beat_clockedschedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_truck_history" ADD CONSTRAINT "driver_truck_history_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_truck_history" ADD CONSTRAINT "driver_truck_history_truck_id_fleet_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."fleet_trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_payments" ADD CONSTRAINT "expected_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_payments" ADD CONSTRAINT "expected_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_payments" ADD CONSTRAINT "expected_payments_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_payments" ADD CONSTRAINT "expected_payments_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_payments" ADD CONSTRAINT "expected_payments_matched_deposit_id_deposits_id_fk" FOREIGN KEY ("matched_deposit_id") REFERENCES "public"."deposits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_payments" ADD CONSTRAINT "expected_payments_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_ledger_entries" ADD CONSTRAINT "fleet_ledger_entries_truck_id_fleet_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."fleet_trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_ledger_entries" ADD CONSTRAINT "fleet_ledger_entries_recorded_by_staff_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_trucks" ADD CONSTRAINT "fleet_trucks_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_trucks" ADD CONSTRAINT "fleet_trucks_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_records" ADD CONSTRAINT "incident_records_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_records" ADD CONSTRAINT "incident_records_submitted_by_staff_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_records" ADD CONSTRAINT "incident_records_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lpg_station_staff" ADD CONSTRAINT "lpg_station_staff_lpg_station_id_lpg_stations_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."lpg_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lpg_station_staff" ADD CONSTRAINT "lpg_station_staff_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lpg_station_cylinders" ADD CONSTRAINT "lpg_station_cylinders_lpg_station_id_lpg_stations_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."lpg_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lpg_price_history" ADD CONSTRAINT "lpg_price_history_lpg_station_id_lpg_stations_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."lpg_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfis" ADD CONSTRAINT "pfis_location_id_depots_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."depots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfis" ADD CONSTRAINT "pfis_lpg_station_id_lpg_stations_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."lpg_stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfis" ADD CONSTRAINT "pfis_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfis" ADD CONSTRAINT "pfis_audit_officer_id_staff_id_fk" FOREIGN KEY ("audit_officer_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfis" ADD CONSTRAINT "pfis_product_officer_id_staff_id_fk" FOREIGN KEY ("product_officer_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfis" ADD CONSTRAINT "pfis_it_compliance_officer_id_staff_id_fk" FOREIGN KEY ("it_compliance_officer_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfis" ADD CONSTRAINT "pfis_security_exit_officer_id_staff_id_fk" FOREIGN KEY ("security_exit_officer_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfis" ADD CONSTRAINT "pfis_commission_officer_id_staff_id_fk" FOREIGN KEY ("commission_officer_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfis" ADD CONSTRAINT "pfis_sales_manager_id_staff_id_fk" FOREIGN KEY ("sales_manager_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_staff" ADD CONSTRAINT "pfi_staff_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_staff" ADD CONSTRAINT "pfi_staff_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_released_by_staff_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_staff_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_verified_by_staff_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_audit_approved_by_staff_id_fk" FOREIGN KEY ("audit_approved_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_admin_approved_by_staff_id_fk" FOREIGN KEY ("admin_approved_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_paid_by_staff_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_added_by_staff_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_edited_by_staff_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expenses" ADD CONSTRAINT "pfi_expenses_recorded_by_staff_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expense_attachments" ADD CONSTRAINT "pfi_expense_attachments_expense_id_pfi_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."pfi_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expense_attachments" ADD CONSTRAINT "pfi_expense_attachments_uploaded_by_staff_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_movements" ADD CONSTRAINT "pfi_movements_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_movements" ADD CONSTRAINT "pfi_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_movements" ADD CONSTRAINT "pfi_movements_recorded_by_staff_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expense_audits" ADD CONSTRAINT "pfi_expense_audits_expense_id_pfi_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."pfi_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expense_audits" ADD CONSTRAINT "pfi_expense_audits_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expense_comments" ADD CONSTRAINT "pfi_expense_comments_expense_id_pfi_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."pfi_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pfi_expense_comments" ADD CONSTRAINT "pfi_expense_comments_author_id_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_pfi_allocations" ADD CONSTRAINT "order_pfi_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_pfi_allocations" ADD CONSTRAINT "order_pfi_allocations_pfi_id_pfis_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."pfis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_truck_id_order_trucks_id_fk" FOREIGN KEY ("order_truck_id") REFERENCES "public"."order_trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_redeemed_by_staff_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deposit_allocations" ADD CONSTRAINT "order_deposit_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deposit_allocations" ADD CONSTRAINT "order_deposit_allocations_deposit_id_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."deposits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_deposit_id_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."deposits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_trucks" ADD CONSTRAINT "order_trucks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_trucks" ADD CONSTRAINT "order_trucks_truck_id_fleet_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."fleet_trucks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_trucks" ADD CONSTRAINT "order_trucks_security_entered_by_staff_id_fk" FOREIGN KEY ("security_entered_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_trucks" ADD CONSTRAINT "order_trucks_loaded_by_staff_id_fk" FOREIGN KEY ("loaded_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_trucks" ADD CONSTRAINT "order_trucks_security_exited_by_staff_id_fk" FOREIGN KEY ("security_exited_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_approved_by_staff_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_reconciled_by_staff_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_sale_items" ADD CONSTRAINT "offline_sale_items_offline_sale_id_offline_sales_id_fk" FOREIGN KEY ("offline_sale_id") REFERENCES "public"."offline_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_sale_items" ADD CONSTRAINT "offline_sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lpg_order_requests" ADD CONSTRAINT "lpg_order_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lpg_order_requests" ADD CONSTRAINT "lpg_order_requests_lpg_station_id_lpg_stations_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."lpg_stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lpg_order_requests" ADD CONSTRAINT "lpg_order_requests_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_sessions" ADD CONSTRAINT "wa_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_sessions" ADD CONSTRAINT "wa_sessions_last_order_id_orders_id_fk" FOREIGN KEY ("last_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_session_id_wa_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wa_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_page_overrides" ADD CONSTRAINT "staff_page_overrides_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."audit_logs" ADD CONSTRAINT "audit_logs_actor_staff_id_administration_user_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."audit_logs" ADD CONSTRAINT "audit_logs_actor_customer_id_consumer_customer_id_fk" FOREIGN KEY ("actor_customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."bank_account_extras" ADD CONSTRAINT "bank_account_extras_bank_account_id_consumer_bankacct_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."consumer_bankacct"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."commissions" ADD CONSTRAINT "commissions_order_id_consumer_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."commissions" ADD CONSTRAINT "commissions_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."commissions" ADD CONSTRAINT "commissions_depot_id_consumer_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."consumer_depots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."commissions" ADD CONSTRAINT "commissions_product_id_consumer_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."consumer_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."commissions" ADD CONSTRAINT "commissions_paid_by_administration_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_credits" ADD CONSTRAINT "customer_credits_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_credits" ADD CONSTRAINT "customer_credits_order_id_consumer_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_credits" ADD CONSTRAINT "customer_credits_payment_record_id_consumer_orderpaymentrecord_id_fk" FOREIGN KEY ("payment_record_id") REFERENCES "public"."consumer_orderpaymentrecord"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_credits" ADD CONSTRAINT "customer_credits_created_by_administration_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_identities" ADD CONSTRAINT "customer_identities_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_trusted_devices" ADD CONSTRAINT "customer_trusted_devices_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_passkeys" ADD CONSTRAINT "customer_passkeys_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_licenses" ADD CONSTRAINT "customer_licenses_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_licenses" ADD CONSTRAINT "customer_licenses_verified_by_administration_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."customer_otps" ADD CONSTRAINT "customer_otps_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."daily_report_extras" ADD CONSTRAINT "daily_report_extras_report_id_administration_staffdailysalesreport_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."administration_staffdailysalesreport"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."dangote_order_requests" ADD CONSTRAINT "dangote_order_requests_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."dangote_order_requests" ADD CONSTRAINT "dangote_order_requests_license_id_customer_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "sman"."customer_licenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."dangote_order_requests" ADD CONSTRAINT "dangote_order_requests_reviewed_by_administration_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."delivery_notes" ADD CONSTRAINT "delivery_notes_customer_id_administration_deliverycustomer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."administration_deliverycustomer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."delivery_notes" ADD CONSTRAINT "delivery_notes_order_id_consumer_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_administration_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."depot_extras" ADD CONSTRAINT "depot_extras_depot_id_consumer_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."consumer_depots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."depot_price_history" ADD CONSTRAINT "depot_price_history_depot_product_price_id_consumer_productprice_id_fk" FOREIGN KEY ("depot_product_price_id") REFERENCES "public"."consumer_productprice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."depot_product_capacities" ADD CONSTRAINT "depot_product_capacities_depot_id_consumer_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."consumer_depots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."depot_product_capacities" ADD CONSTRAINT "depot_product_capacities_product_id_consumer_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."consumer_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."depot_product_commissions" ADD CONSTRAINT "depot_product_commissions_depot_id_consumer_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."consumer_depots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."depot_product_commissions" ADD CONSTRAINT "depot_product_commissions_product_id_consumer_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."consumer_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."depot_staff" ADD CONSTRAINT "depot_staff_depot_id_consumer_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."consumer_depots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."depot_staff" ADD CONSTRAINT "depot_staff_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."device_tokens" ADD CONSTRAINT "device_tokens_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."device_tokens" ADD CONSTRAINT "device_tokens_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."driver_truck_history" ADD CONSTRAINT "driver_truck_history_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "sman"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."driver_truck_history" ADD CONSTRAINT "driver_truck_history_truck_id_consumer_fleettruck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."consumer_fleettruck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."expected_payments" ADD CONSTRAINT "expected_payments_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."expected_payments" ADD CONSTRAINT "expected_payments_order_id_consumer_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."expected_payments" ADD CONSTRAINT "expected_payments_depot_id_consumer_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."consumer_depots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."expected_payments" ADD CONSTRAINT "expected_payments_pfi_id_consumer_pfi_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."expected_payments" ADD CONSTRAINT "expected_payments_matched_deposit_id_consumer_orderpaymentrecord_id_fk" FOREIGN KEY ("matched_deposit_id") REFERENCES "public"."consumer_orderpaymentrecord"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."expected_payments" ADD CONSTRAINT "expected_payments_created_by_administration_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."expense_category_extras" ADD CONSTRAINT "expense_category_extras_category_id_consumer_expensecategory_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."consumer_expensecategory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."truck_extras" ADD CONSTRAINT "truck_extras_truck_id_consumer_fleettruck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."consumer_fleettruck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."sessions" ADD CONSTRAINT "sessions_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."sessions" ADD CONSTRAINT "sessions_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."lpg_station_staff" ADD CONSTRAINT "lpg_station_staff_lpg_station_id_consumer_lpgplant_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."consumer_lpgplant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."lpg_station_staff" ADD CONSTRAINT "lpg_station_staff_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."pfi_staff" ADD CONSTRAINT "pfi_staff_pfi_id_consumer_pfi_id_fk" FOREIGN KEY ("pfi_id") REFERENCES "public"."consumer_pfi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."pfi_staff" ADD CONSTRAINT "pfi_staff_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."wallet_holds" ADD CONSTRAINT "wallet_holds_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."wallet_holds" ADD CONSTRAINT "wallet_holds_order_id_consumer_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."wallet_holds" ADD CONSTRAINT "wallet_holds_deposit_id_consumer_orderpaymentrecord_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."consumer_orderpaymentrecord"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."order_deposit_allocations" ADD CONSTRAINT "order_deposit_allocations_order_id_consumer_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."consumer_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."order_deposit_allocations" ADD CONSTRAINT "order_deposit_allocations_deposit_id_consumer_orderpaymentrecord_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."consumer_orderpaymentrecord"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."vendors" ADD CONSTRAINT "vendors_created_by_administration_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."pfi_expense_extras" ADD CONSTRAINT "pfi_expense_extras_expense_id_consumer_pfiexpense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."consumer_pfiexpense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."pfi_expense_extras" ADD CONSTRAINT "pfi_expense_extras_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "sman"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."pfi_expense_comments" ADD CONSTRAINT "pfi_expense_comments_expense_id_consumer_pfiexpense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."consumer_pfiexpense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."pfi_expense_comments" ADD CONSTRAINT "pfi_expense_comments_author_id_administration_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."lpg_station_cylinders" ADD CONSTRAINT "lpg_station_cylinders_lpg_station_id_consumer_lpgplant_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."consumer_lpgplant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."lpg_price_history" ADD CONSTRAINT "lpg_price_history_lpg_station_id_consumer_lpgplant_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."consumer_lpgplant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."lpg_station_extras" ADD CONSTRAINT "lpg_station_extras_lpg_station_id_consumer_lpgplant_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."consumer_lpgplant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."lpg_order_requests" ADD CONSTRAINT "lpg_order_requests_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."lpg_order_requests" ADD CONSTRAINT "lpg_order_requests_lpg_station_id_consumer_lpgplant_id_fk" FOREIGN KEY ("lpg_station_id") REFERENCES "public"."consumer_lpgplant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."lpg_order_requests" ADD CONSTRAINT "lpg_order_requests_reviewed_by_administration_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."staff_page_overrides" ADD CONSTRAINT "staff_page_overrides_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."staff_password_resets" ADD CONSTRAINT "staff_password_resets_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."notifications" ADD CONSTRAINT "notifications_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."notifications" ADD CONSTRAINT "notifications_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "sman"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."notification_preferences" ADD CONSTRAINT "notification_preferences_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."notification_preferences" ADD CONSTRAINT "notification_preferences_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."notification_settings" ADD CONSTRAINT "notification_settings_staff_id_administration_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."administration_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."notification_settings" ADD CONSTRAINT "notification_settings_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."message_templates" ADD CONSTRAINT "message_templates_created_by_administration_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."administration_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."wa_sessions" ADD CONSTRAINT "wa_sessions_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."wa_sessions" ADD CONSTRAINT "wa_sessions_last_order_id_consumer_order_id_fk" FOREIGN KEY ("last_order_id") REFERENCES "public"."consumer_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."wa_messages" ADD CONSTRAINT "wa_messages_session_id_wa_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sman"."wa_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sman"."wa_messages" ADD CONSTRAINT "wa_messages_customer_id_consumer_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."consumer_customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "administration_category_name_6b6f3a73_like" ON "administration_category" USING btree ("name" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "administration_confirmrelease_order_id_4846adfb" ON "administration_confirmrelease" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_dailyreportapproval_approved_by_id_1330bc97" ON "administration_dailyreportapproval" USING btree ("approved_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_deliveryinventory_allocation_code_290755b7" ON "administration_deliveryinventory" USING btree ("allocation_code" text_ops);--> statement-breakpoint
CREATE INDEX "administration_deliveryinventory_allocation_code_290755b7_like" ON "administration_deliveryinventory" USING btree ("allocation_code" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "administration_deliveryinventory_customer_id_395575a8" ON "administration_deliveryinventory" USING btree ("customer_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_deliveryinventory_pfi_id_932b9bd6" ON "administration_deliveryinventory" USING btree ("pfi_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_deliveryinventory_truck_id_4a27f975" ON "administration_deliveryinventory" USING btree ("truck_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_deliveryinv_deliveryinventory_id_919898f4" ON "administration_deliveryinventory_trucks" USING btree ("deliveryinventory_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_deliveryinventory_trucks_fleettruck_id_f102cd04" ON "administration_deliveryinventory_trucks" USING btree ("fleettruck_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_deliveryled_settings_obj_id_75295e60" ON "administration_deliveryledgersettingsaudit" USING btree ("settings_obj_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_deliveryled_updated_by_id_d50bd58b" ON "administration_deliveryledgersettingsaudit" USING btree ("updated_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_deliverysale_allocation_code_eab3ed2f" ON "administration_deliverysale" USING btree ("allocation_code" text_ops);--> statement-breakpoint
CREATE INDEX "administration_deliverysale_allocation_code_eab3ed2f_like" ON "administration_deliverysale" USING btree ("allocation_code" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "administration_deliverysale_customer_id_235d2c38" ON "administration_deliverysale" USING btree ("customer_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administrat_id_16afc1_idx" ON "administration_offlinesales" USING btree ("id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_offlinesales_state_id_1e65a692" ON "administration_offlinesales" USING btree ("state_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_offlinesalesproduct_offline_id_8f4058e0" ON "administration_offlinesalesproduct" USING btree ("offline_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_offlinesalesproduct_product_id_56de22b3" ON "administration_offlinesalesproduct" USING btree ("product_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_offlinesales_trucks_offlinesales_id_3680edb5" ON "administration_offlinesales_trucks" USING btree ("offlinesales_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_offlinesales_trucks_truck_id_b7951bfa" ON "administration_offlinesales_trucks" USING btree ("truck_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_record_reviewed_by_id_21c842b0" ON "administration_record" USING btree ("reviewed_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_record_submitted_by_id_bf85d70b" ON "administration_record" USING btree ("submitted_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_reportrecipient_email_c2436747_like" ON "administration_reportrecipient" USING btree ("email" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "administration_staffdailysalesreport_date_1d30368b" ON "administration_staffdailysalesreport" USING btree ("date" date_ops);--> statement-breakpoint
CREATE INDEX "administration_staffdailysalesreport_location_d593306d" ON "administration_staffdailysalesreport" USING btree ("location" text_ops);--> statement-breakpoint
CREATE INDEX "administration_staffdailysalesreport_location_d593306d_like" ON "administration_staffdailysalesreport" USING btree ("location" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "administration_staffdailysalesreport_submitted_by_id_fdc20360" ON "administration_staffdailysalesreport" USING btree ("submitted_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_email_1d334039_like" ON "administration_user" USING btree ("email" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "administration_user_phone_number_45df971d_like" ON "administration_user" USING btree ("phone_number" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "administration_user_fillin_deliverycustomer_id_9b285a15" ON "administration_user_filling_stations" USING btree ("deliverycustomer_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_filling_stations_user_id_93c3fbe9" ON "administration_user_filling_stations" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_groups_group_id_43b1e17e" ON "administration_user_groups" USING btree ("group_id" int4_ops);--> statement-breakpoint
CREATE INDEX "administration_user_groups_user_id_fcbab611" ON "administration_user_groups" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_locations_states_id_ff603b53" ON "administration_user_locations" USING btree ("states_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_locations_user_id_89ab3271" ON "administration_user_locations" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_lpg_plants_lpgplant_id_e16ceee4" ON "administration_user_lpg_plants" USING btree ("lpgplant_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_lpg_plants_user_id_18fb1020" ON "administration_user_lpg_plants" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_pfis_pfi_id_de6488cf" ON "administration_user_pfis" USING btree ("pfi_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_pfis_user_id_044ba9d7" ON "administration_user_pfis" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_usertoken_key_e78d26b6_like" ON "administration_usertoken" USING btree ("key" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "administration_usertoken_user_id_bec07dde" ON "administration_usertoken" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "administration_user_user_permissions_permission_id_5b940bd2" ON "administration_user_user_permissions" USING btree ("permission_id" int4_ops);--> statement-breakpoint
CREATE INDEX "administration_user_user_permissions_user_id_69e83b80" ON "administration_user_user_permissions" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_staff_idx" ON "audit_logs" USING btree ("actor_staff_id","created_at") WHERE "audit_logs"."actor_staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_group_name_a6ea08ec_like" ON "auth_group" USING btree ("name" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "auth_group_permissions_group_id_b120cbf9" ON "auth_group_permissions" USING btree ("group_id" int4_ops);--> statement-breakpoint
CREATE INDEX "auth_group_permissions_permission_id_84c5c92e" ON "auth_group_permissions" USING btree ("permission_id" int4_ops);--> statement-breakpoint
CREATE INDEX "auth_permission_content_type_id_2f476e4b" ON "auth_permission" USING btree ("content_type_id" int4_ops);--> statement-breakpoint
CREATE INDEX "authtoken_token_key_10f0b77e_like" ON "authtoken_token" USING btree ("key" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "auth_user_username_6821ab7c_like" ON "auth_user" USING btree ("username" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "auth_user_groups_group_id_97559544" ON "auth_user_groups" USING btree ("group_id" int4_ops);--> statement-breakpoint
CREATE INDEX "auth_user_groups_user_id_6a12ed8b" ON "auth_user_groups" USING btree ("user_id" int4_ops);--> statement-breakpoint
CREATE INDEX "auth_user_user_permissions_permission_id_1fbb5f2c" ON "auth_user_user_permissions" USING btree ("permission_id" int4_ops);--> statement-breakpoint
CREATE INDEX "auth_user_user_permissions_user_id_a95ead1b" ON "auth_user_user_permissions" USING btree ("user_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "bscm_bank_account_unique" ON "bank_statement_column_mappings" USING btree ("bank_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bsl_account_dedup_unique" ON "bank_statement_lines" USING btree ("bank_account_id","dedup_key");--> statement-breakpoint
CREATE INDEX "bsl_pool_idx" ON "bank_statement_lines" USING btree ("bank_account_id","status");--> statement-breakpoint
CREATE INDEX "commissions_order_idx" ON "commissions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "commissions_customer_idx" ON "commissions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "commissions_status_idx" ON "commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commissions_depot_product_idx" ON "commissions" USING btree ("depot_id","product_id");--> statement-breakpoint
CREATE INDEX "customer_licenses_customer_id_idx" ON "customer_licenses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_licenses_status_idx" ON "customer_licenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "consumer_agent_location_id_81f36b58" ON "consumer_agent" USING btree ("location_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_agent_phone_9cf6c3c3_like" ON "consumer_agent" USING btree ("phone" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_auditlog_actor_id_fa079501" ON "consumer_auditlog" USING btree ("actor_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_auditlog_order_id_dc6c79ae" ON "consumer_auditlog" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankacct_acct_no_6a4701a1_like" ON "consumer_bankacct" USING btree ("acct_no" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankacct_location_id_9cc0b835" ON "consumer_bankacct" USING btree ("location_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankacct_pfi_id_386c609a" ON "consumer_bankacct" USING btree ("pfi_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatement_bank_account_id_2c8407c0" ON "consumer_bankstatement" USING btree ("bank_account_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatement_uploaded_by_id_ebed2fb2" ON "consumer_bankstatement" USING btree ("uploaded_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatementcolumnmapping_created_by_id_5146d134" ON "consumer_bankstatementcolumnmapping" USING btree ("created_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatementline_bank_account_id_2f7ac500" ON "consumer_bankstatementline" USING btree ("bank_account_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatementline_dedup_key_160f79ec" ON "consumer_bankstatementline" USING btree ("dedup_key" text_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatementline_dedup_key_160f79ec_like" ON "consumer_bankstatementline" USING btree ("dedup_key" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatementline_matched_by_id_605ad10f" ON "consumer_bankstatementline" USING btree ("matched_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatementline_matched_order_id_b2520e81" ON "consumer_bankstatementline" USING btree ("matched_order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatementline_matched_payment_record_id_b2f56ecb" ON "consumer_bankstatementline" USING btree ("matched_payment_record_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_bankstatementline_statement_id_13b4c42e" ON "consumer_bankstatementline" USING btree ("statement_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_deliveryorders_delivery_state_id_44ba3748" ON "consumer_deliveryorders" USING btree ("delivery_state_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_deliveryorders_order_id_b9c187e7" ON "consumer_deliveryorders" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_ex_is_syst_9fd317_idx" ON "consumer_expensecategory" USING btree ("is_system_category" bool_ops);--> statement-breakpoint
CREATE INDEX "consumer_ex_name_9709e8_idx" ON "consumer_expensecategory" USING btree ("name" text_ops);--> statement-breakpoint
CREATE INDEX "consumer_expensecategory_name_3331ece2_like" ON "consumer_expensecategory" USING btree ("name" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_expensecategory_pfi_id_7ce97f76" ON "consumer_expensecategory" USING btree ("pfi_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_fleetledgerentry_truck_id_b9b435d2" ON "consumer_fleetledgerentry" USING btree ("truck_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_fleettruck_plate_number_a8e711b1_like" ON "consumer_fleettruck" USING btree ("plate_number" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_locationcommissionrate_updated_by_id_3f821a33" ON "consumer_locationcommissionrate" USING btree ("updated_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_lpgplant_code_11df6dd8_like" ON "consumer_lpgplant" USING btree ("code" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_lpgplant_location_id_28f59289" ON "consumer_lpgplant" USING btree ("location_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_lpgplant_name_a73c3732_like" ON "consumer_lpgplant" USING btree ("name" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_lpgsale_cashier_id_309419be" ON "consumer_lpgsale" USING btree ("cashier_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_lpgsale_invoice_number_5db198f8_like" ON "consumer_lpgsale" USING btree ("invoice_number" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_lpgsale_plant_id_d1f1981c" ON "consumer_lpgsale" USING btree ("plant_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_lpgstockentry_plant_id_76489617" ON "consumer_lpgstockentry" USING btree ("plant_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_lpgstockentry_recorded_by_id_8df38296" ON "consumer_lpgstockentry" USING btree ("recorded_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_or_id_642470_idx" ON "consumer_order" USING btree ("id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_assigned_agent_id_85f408a3" ON "consumer_order" USING btree ("assigned_agent_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_commission_paid_by_id_30ee53ab" ON "consumer_order" USING btree ("commission_paid_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_order_fingerprint_18d15027" ON "consumer_order" USING btree ("order_fingerprint" text_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_order_fingerprint_18d15027_like" ON "consumer_order" USING btree ("order_fingerprint" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_payment_confirmed_by_id_36029149" ON "consumer_order" USING btree ("payment_confirmed_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_pfi_id_97a6b8c4" ON "consumer_order" USING btree ("pfi_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_released_by_id_3906dd7b" ON "consumer_order" USING btree ("released_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_security_entered_by_id_e0678ae8" ON "consumer_order" USING btree ("security_entered_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_security_exited_by_id_78c96a5f" ON "consumer_order" USING btree ("security_exited_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_state_id_5cb2f2ef" ON "consumer_order" USING btree ("state_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_ticket_generated_by_id_45b2448b" ON "consumer_order" USING btree ("ticket_generated_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_order_user_id_81684fac" ON "consumer_order" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "order_created_desc_idx" ON "consumer_order" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "order_release_status_idx" ON "consumer_order" USING btree ("release_status" text_ops);--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "consumer_order" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderauditevent_actor_user_id_76dca81c" ON "consumer_orderauditevent" USING btree ("actor_user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderauditevent_order_id_89c778f0" ON "consumer_orderauditevent" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "oae_action_idx" ON "consumer_orderauditevent" USING btree ("action" text_ops);--> statement-breakpoint
CREATE INDEX "oae_actor_idx" ON "consumer_orderauditevent" USING btree ("actor_user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "oae_created_idx" ON "consumer_orderauditevent" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "oae_order_idx" ON "consumer_orderauditevent" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderpaymentinfo_bank_account_id_faab00d8" ON "consumer_orderpaymentinfo" USING btree ("bank_account_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderpaymentinfo_payment_channel_id_f3fe2953" ON "consumer_orderpaymentinfo" USING btree ("payment_channel_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderpaymentinfo_reference_0d72d9af_like" ON "consumer_orderpaymentinfo" USING btree ("reference" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderpaymentrecord_bank_account_id_bdb936a0" ON "consumer_orderpaymentrecord" USING btree ("bank_account_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderpaymentrecord_created_by_id_2a9cfe40" ON "consumer_orderpaymentrecord" USING btree ("created_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderpaymentrecord_order_id_0eab3d95" ON "consumer_orderpaymentrecord" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderpaymentrecord_transaction_reference_23fa21d7_like" ON "consumer_orderpaymentrecord" USING btree ("transaction_reference" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderproduct_order_id_1e96a268" ON "consumer_orderproduct" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_orderproduct_product_id_0491d358" ON "consumer_orderproduct" USING btree ("product_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_overpaymenttransferrequest_requested_by_id_25e75012" ON "consumer_overpaymenttransferrequest" USING btree ("requested_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_overpaymenttransferrequest_reviewed_by_id_59c5c526" ON "consumer_overpaymenttransferrequest" USING btree ("reviewed_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_overpaymenttransferrequest_source_order_id_19f1a44c" ON "consumer_overpaymenttransferrequest" USING btree ("source_order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_overpaymenttransferrequest_target_order_id_2a3a55f2" ON "consumer_overpaymenttransferrequest" USING btree ("target_order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_paymentfile_order_id_cdd06dcb" ON "consumer_paymentfile" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pa_order_i_262730_idx" ON "consumer_paymentsplit" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_paymentsplit_order_id_7a2d67d1" ON "consumer_paymentsplit" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pf_created_61ea80_idx" ON "consumer_pfi" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_audit_officer_id_92963914" ON "consumer_pfi" USING btree ("audit_officer_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_commission_officer_id_b955bccd" ON "consumer_pfi" USING btree ("commission_officer_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_created_by_id_a9ca7415" ON "consumer_pfi" USING btree ("created_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_finance_person_id_9c92e0d5" ON "consumer_pfi" USING btree ("finance_person_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_it_compliance_officer_id_adacca23" ON "consumer_pfi" USING btree ("it_compliance_officer_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_location_id_53c8a6ed" ON "consumer_pfi" USING btree ("location_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_marketing_person_id_ca514db6" ON "consumer_pfi" USING btree ("marketing_person_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_pfi_number_a1742690_like" ON "consumer_pfi" USING btree ("pfi_number" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_product_id_bad0bf45" ON "consumer_pfi" USING btree ("product_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_product_officer_id_8fb6de1d" ON "consumer_pfi" USING btree ("product_officer_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_sales_manager_id_49b824fc" ON "consumer_pfi" USING btree ("sales_manager_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_security_exit_officer_id_55bcda50" ON "consumer_pfi" USING btree ("security_exit_officer_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_allowed_locations_pfi_id_1b1283ab" ON "consumer_pfi_allowed_locations" USING btree ("pfi_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfi_allowed_locations_states_id_e5116c02" ON "consumer_pfi_allowed_locations" USING btree ("states_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pf_deleted_3e38b3_idx" ON "consumer_pfiexpense" USING btree ("deleted_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "consumer_pf_pfi_id_688b26_idx" ON "consumer_pfiexpense" USING btree ("pfi_id" int8_ops,"category_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_added_by_id_f696ea64" ON "consumer_pfiexpense" USING btree ("added_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_admin_approved_by_id_ddaea4f9" ON "consumer_pfiexpense" USING btree ("admin_approved_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_audit_approved_by_id_03b97dd5" ON "consumer_pfiexpense" USING btree ("audit_approved_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_category_id_9a9007f2" ON "consumer_pfiexpense" USING btree ("category_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_edited_by_id_31e459f0" ON "consumer_pfiexpense" USING btree ("edited_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_paid_by_id_8c44101d" ON "consumer_pfiexpense" USING btree ("paid_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_pfi_id_398caccb" ON "consumer_pfiexpense" USING btree ("pfi_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_reviewed_by_id_0cdae3e9" ON "consumer_pfiexpense" USING btree ("reviewed_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_status_b6f290c2" ON "consumer_pfiexpense" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_status_b6f290c2_like" ON "consumer_pfiexpense" USING btree ("status" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpense_verified_by_id_fb7c8e9a" ON "consumer_pfiexpense" USING btree ("verified_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpenseattachment_expense_id_a4da6eae" ON "consumer_pfiexpenseattachment" USING btree ("expense_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpenseattachment_uploaded_by_id_a1f0da1d" ON "consumer_pfiexpenseattachment" USING btree ("uploaded_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pf_expense_bb88ea_idx" ON "consumer_pfiexpenseaudit" USING btree ("expense_id" int8_ops,"performed_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpenseaudit_expense_id_11474495" ON "consumer_pfiexpenseaudit" USING btree ("expense_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfiexpenseaudit_performed_by_id_52a514fe" ON "consumer_pfiexpenseaudit" USING btree ("performed_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pf_order_i_7e31da_idx" ON "consumer_pfimovement" USING btree ("order_id" int8_ops,"action" text_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfimovement_order_id_e5c957e2" ON "consumer_pfimovement" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfimovement_pfi_id_05fbfca2" ON "consumer_pfimovement" USING btree ("pfi_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pfimovement_user_id_7e293198" ON "consumer_pfimovement" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pickuporders_order_id_56c89f68" ON "consumer_pickuporders" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pickuporders_state_id_e6380670" ON "consumer_pickuporders" USING btree ("state_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_pickuptruck_pickup_order_id_65bbd981" ON "consumer_pickuptruck" USING btree ("pickup_order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_productprice_product_id_af686dda" ON "consumer_productprice" USING btree ("product_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_productprice_state_id_38860880" ON "consumer_productprice" USING btree ("state_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_truck_no_fff21c6f_like" ON "consumer_truck" USING btree ("no" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_tr_ticket__4b889f_idx" ON "consumer_truckallocation" USING btree ("ticket_status" text_ops);--> statement-breakpoint
CREATE INDEX "consumer_truckallocation_order_id_bfa195b5" ON "consumer_truckallocation" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_truckallocation_order_product_id_ac4fe6c0" ON "consumer_truckallocation" USING btree ("order_product_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_truckallocation_ticket_number_dacd8122_like" ON "consumer_truckallocation" USING btree ("ticket_number" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "consumer_tr_order_i_7bf677_idx" ON "consumer_truckbreakdown" USING btree ("order_id" int8_ops,"id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_truckbreakdown_order_id_32028343" ON "consumer_truckbreakdown" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_truckticket_entered_by_id_cdaa061c" ON "consumer_truckticket" USING btree ("entered_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_truckticket_exited_by_id_78440475" ON "consumer_truckticket" USING btree ("exited_by_id" int8_ops);--> statement-breakpoint
CREATE INDEX "consumer_truckticket_order_id_5ef9cb8d" ON "consumer_truckticket" USING btree ("order_id" int8_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_virtual_account_idx" ON "customers" USING btree ("virtual_account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identities_provider_uid_idx" ON "customer_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identities_customer_provider_idx" ON "customer_identities" USING btree ("customer_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_trusted_devices_token_idx" ON "customer_trusted_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_trusted_devices_customer_idx" ON "customer_trusted_devices" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_passkeys_credential_idx" ON "customer_passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "customer_passkeys_customer_idx" ON "customer_passkeys" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webauthn_challenges_challenge_idx" ON "webauthn_challenges" USING btree ("challenge");--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expires_idx" ON "webauthn_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customer_otps_lookup_idx" ON "customer_otps" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_otps_sweep_idx" ON "customer_otps" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customer_otps_created_idx" ON "customer_otps" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_reports_unique_idx" ON "daily_reports" USING btree ("report_type","report_date","location","pfi_number","submitted_by");--> statement-breakpoint
CREATE INDEX "daily_reports_date_location_idx" ON "daily_reports" USING btree ("report_date","location");--> statement-breakpoint
CREATE INDEX "daily_reports_status_idx" ON "daily_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dangote_requests_status_idx" ON "dangote_order_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dangote_requests_customer_idx" ON "dangote_order_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "dangote_products_status_idx" ON "dangote_products" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_customers_code_idx" ON "delivery_customers" USING btree ("customer_code");--> statement-breakpoint
CREATE INDEX "delivery_customers_type_idx" ON "delivery_customers" USING btree ("customer_type");--> statement-breakpoint
CREATE INDEX "delivery_customers_status_idx" ON "delivery_customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "delivery_customers_virtual_account_idx" ON "delivery_customers" USING btree ("virtual_account_number");--> statement-breakpoint
CREATE INDEX "delivery_inventory_truck_idx" ON "delivery_inventory" USING btree ("truck_id");--> statement-breakpoint
CREATE INDEX "delivery_inventory_pfi_idx" ON "delivery_inventory" USING btree ("pfi_id");--> statement-breakpoint
CREATE INDEX "delivery_inventory_customer_idx" ON "delivery_inventory" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "delivery_inventory_status_idx" ON "delivery_inventory" USING btree ("loading_status");--> statement-breakpoint
CREATE INDEX "delivery_ledger_settings_key_5f5e4c7b_like" ON "delivery_ledger_settings" USING btree ("key" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "delivery_ledger_settings_updated_by_id_1239fc6a" ON "delivery_ledger_settings" USING btree ("updated_by_id" int8_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_notes_number_idx" ON "delivery_notes" USING btree ("delivery_note_number");--> statement-breakpoint
CREATE INDEX "delivery_notes_customer_idx" ON "delivery_notes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "delivery_notes_status_idx" ON "delivery_notes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "delivery_sales_customer_idx" ON "delivery_sales" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "delivery_sales_truck_idx" ON "delivery_sales" USING btree ("truck_number");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_sales_paystack_ref_unique_idx" ON "delivery_sales" USING btree ("paystack_reference") WHERE "delivery_sales"."paystack_reference" IS NOT NULL AND "delivery_sales"."paystack_reference" != '';--> statement-breakpoint
CREATE INDEX "deposits_customer_created_idx" ON "deposits" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_reference_unique_idx" ON "deposits" USING btree ("reference") WHERE "deposits"."reference" IS NOT NULL AND "deposits"."reference" != '';--> statement-breakpoint
CREATE UNIQUE INDEX "depots_code_idx" ON "depots" USING btree ("code");--> statement-breakpoint
CREATE INDEX "depot_price_history_parent_idx" ON "depot_price_history" USING btree ("depot_product_price_id");--> statement-breakpoint
CREATE UNIQUE INDEX "depot_product_cap_unique_idx" ON "depot_product_capacities" USING btree ("depot_id","product_id");--> statement-breakpoint
CREATE INDEX "depot_product_cap_depot_idx" ON "depot_product_capacities" USING btree ("depot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "depot_product_commission_unique_idx" ON "depot_product_commissions" USING btree ("depot_id","product_id");--> statement-breakpoint
CREATE INDEX "depot_product_commission_depot_idx" ON "depot_product_commissions" USING btree ("depot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "depot_product_price_unique_idx" ON "depot_product_prices" USING btree ("depot_id","product_id");--> statement-breakpoint
CREATE INDEX "depot_product_price_depot_idx" ON "depot_product_prices" USING btree ("depot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "depot_staff_unique_idx" ON "depot_staff" USING btree ("depot_id","staff_id");--> statement-breakpoint
CREATE INDEX "depot_staff_depot_idx" ON "depot_staff" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "depot_staff_staff_idx" ON "depot_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_token_idx" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "device_tokens_staff_idx" ON "device_tokens" USING btree ("staff_id") WHERE "device_tokens"."disabled_at" IS NULL AND "device_tokens"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "device_tokens_customer_idx" ON "device_tokens" USING btree ("customer_id") WHERE "device_tokens"."disabled_at" IS NULL AND "device_tokens"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "device_tokens_device_idx" ON "device_tokens" USING btree ("device_id") WHERE "device_tokens"."device_id" <> '';--> statement-breakpoint
CREATE INDEX "django_admin_log_content_type_id_c4bce8eb" ON "django_admin_log" USING btree ("content_type_id" int4_ops);--> statement-breakpoint
CREATE INDEX "django_admin_log_user_id_c564eba6" ON "django_admin_log" USING btree ("user_id" int4_ops);--> statement-breakpoint
CREATE INDEX "django_celery_beat_periodictask_clocked_id_47a69f82" ON "django_celery_beat_periodictask" USING btree ("clocked_id" int4_ops);--> statement-breakpoint
CREATE INDEX "django_celery_beat_periodictask_crontab_id_d3cba168" ON "django_celery_beat_periodictask" USING btree ("crontab_id" int4_ops);--> statement-breakpoint
CREATE INDEX "django_celery_beat_periodictask_interval_id_a8ca27da" ON "django_celery_beat_periodictask" USING btree ("interval_id" int4_ops);--> statement-breakpoint
CREATE INDEX "django_celery_beat_periodictask_name_265a36b7_like" ON "django_celery_beat_periodictask" USING btree ("name" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "django_celery_beat_periodictask_solar_id_a87ce72c" ON "django_celery_beat_periodictask" USING btree ("solar_id" int4_ops);--> statement-breakpoint
CREATE INDEX "django_session_expire_date_a5c62663" ON "django_session" USING btree ("expire_date" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "django_session_session_key_c0390e0f_like" ON "django_session" USING btree ("session_key" varchar_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_license_number_idx" ON "drivers" USING btree ("license_number");--> statement-breakpoint
CREATE INDEX "drivers_status_idx" ON "drivers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "drivers_truck_idx" ON "drivers" USING btree ("assigned_truck_ref");--> statement-breakpoint
CREATE INDEX "driver_truck_history_driver_idx" ON "driver_truck_history" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_truck_history_truck_idx" ON "driver_truck_history" USING btree ("truck_id");--> statement-breakpoint
CREATE INDEX "expected_payments_customer_status_idx" ON "expected_payments" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "expected_payments_order_idx" ON "expected_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "fleet_ledger_truck_date_idx" ON "fleet_ledger_entries" USING btree ("truck_id","entry_date");--> statement-breakpoint
CREATE INDEX "fleet_ledger_category_idx" ON "fleet_ledger_entries" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_trucks_plate_idx" ON "fleet_trucks" USING btree ("plate_number");--> statement-breakpoint
CREATE INDEX "fleet_trucks_active_idx" ON "fleet_trucks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "incident_records_type_idx" ON "incident_records" USING btree ("incident_type");--> statement-breakpoint
CREATE INDEX "incident_records_status_idx" ON "incident_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "incident_records_created_idx" ON "incident_records" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_idx" ON "staff" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_idx" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_type_idx" ON "products" USING btree ("product_type");--> statement-breakpoint
CREATE UNIQUE INDEX "lpg_stations_code_idx" ON "lpg_stations" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "lpg_station_staff_unique_idx" ON "lpg_station_staff" USING btree ("lpg_station_id","staff_id");--> statement-breakpoint
CREATE INDEX "lpg_station_staff_station_idx" ON "lpg_station_staff" USING btree ("lpg_station_id");--> statement-breakpoint
CREATE INDEX "lpg_station_staff_staff_idx" ON "lpg_station_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "lpg_station_cylinders_station_idx" ON "lpg_station_cylinders" USING btree ("lpg_station_id");--> statement-breakpoint
CREATE INDEX "lpg_price_history_station_idx" ON "lpg_price_history" USING btree ("lpg_station_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pfis_pfi_number_idx" ON "pfis" USING btree ("pfi_number");--> statement-breakpoint
CREATE INDEX "pfis_location_product_status_idx" ON "pfis" USING btree ("location_id","product_id","status");--> statement-breakpoint
CREATE INDEX "pfis_lpg_station_idx" ON "pfis" USING btree ("lpg_station_id");--> statement-breakpoint
CREATE INDEX "pfis_status_idx" ON "pfis" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pfi_staff_unique_idx" ON "pfi_staff" USING btree ("pfi_id","staff_id");--> statement-breakpoint
CREATE INDEX "pfi_staff_pfi_idx" ON "pfi_staff" USING btree ("pfi_id");--> statement-breakpoint
CREATE INDEX "pfi_staff_staff_idx" ON "pfi_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key") WHERE "orders"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_customer_payment_created_idx" ON "orders" USING btree ("customer_id","payment_status","created_at");--> statement-breakpoint
CREATE INDEX "orders_virtual_account_payment_idx" ON "orders" USING btree ("virtual_account_number","payment_status");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_name_idx" ON "vendors" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_name_idx" ON "expense_categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_pfi_idx" ON "expense_categories" USING btree ("pfi_id") WHERE "expense_categories"."pfi_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_gl_code_idx" ON "expense_categories" USING btree ("gl_code") WHERE "expense_categories"."gl_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pfi_expenses_pfi_idx" ON "pfi_expenses" USING btree ("pfi_id");--> statement-breakpoint
CREATE INDEX "pfi_expenses_category_idx" ON "pfi_expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "pfi_expenses_date_idx" ON "pfi_expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "pfi_expenses_status_idx" ON "pfi_expenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pfi_expenses_vendor_idx" ON "pfi_expenses" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pfi_expenses_reference_number_idx" ON "pfi_expenses" USING btree ("reference_number");--> statement-breakpoint
CREATE INDEX "pfi_expenses_live_idx" ON "pfi_expenses" USING btree ("pfi_id") WHERE "pfi_expenses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "pfi_expense_attachments_expense_idx" ON "pfi_expense_attachments" USING btree ("expense_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pfi_movements_order_action_idx" ON "pfi_movements" USING btree ("order_id","action");--> statement-breakpoint
CREATE INDEX "pfi_movements_pfi_idx" ON "pfi_movements" USING btree ("pfi_id");--> statement-breakpoint
CREATE INDEX "pfi_expense_audits_expense_idx" ON "pfi_expense_audits" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "pfi_expense_comments_expense_idx" ON "pfi_expense_comments" USING btree ("expense_id","created_at");--> statement-breakpoint
CREATE INDEX "opa_order_idx" ON "order_pfi_allocations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "opa_pfi_idx" ON "order_pfi_allocations" USING btree ("pfi_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_pfi_allocations_order_pfi_idx" ON "order_pfi_allocations" USING btree ("order_id","pfi_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_ticket_number_idx" ON "tickets" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tickets_order_truck_idx" ON "tickets" USING btree ("order_truck_id") WHERE "tickets"."order_truck_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_deposit_allocations_order_deposit_idx" ON "order_deposit_allocations" USING btree ("order_id","deposit_id");--> statement-breakpoint
CREATE INDEX "order_deposit_allocations_deposit_idx" ON "order_deposit_allocations" USING btree ("deposit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_holds_order_idx" ON "wallet_holds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "wallet_holds_customer_status_idx" ON "wallet_holds" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "webhook_events_status_created_idx" ON "webhook_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_idx" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_staff_idx" ON "sessions" USING btree ("staff_id","created_at") WHERE "sessions"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_customer_idx" ON "sessions" USING btree ("customer_id","created_at") WHERE "sessions"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at") WHERE "sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "order_trucks_order_idx" ON "order_trucks" USING btree ("order_id","truck_index");--> statement-breakpoint
CREATE INDEX "order_trucks_truck_idx" ON "order_trucks" USING btree ("truck_id") WHERE "order_trucks"."truck_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "order_trucks_status_idx" ON "order_trucks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "offline_sales_number_idx" ON "offline_sales" USING btree ("sale_number");--> statement-breakpoint
CREATE INDEX "offline_sales_status_idx" ON "offline_sales" USING btree ("status");--> statement-breakpoint
CREATE INDEX "offline_sales_created_idx" ON "offline_sales" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offline_sale_items_sale_product_idx" ON "offline_sale_items" USING btree ("offline_sale_id","product_id");--> statement-breakpoint
CREATE INDEX "lpg_requests_status_idx" ON "lpg_order_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lpg_requests_customer_idx" ON "lpg_order_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "lpg_requests_station_idx" ON "lpg_order_requests" USING btree ("lpg_station_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_sessions_phone_idx" ON "wa_sessions" USING btree ("wa_phone");--> statement-breakpoint
CREATE INDEX "wa_sessions_expires_idx" ON "wa_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_messages_wamid_idx" ON "wa_messages" USING btree ("wamid") WHERE "wa_messages"."wamid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "wa_messages_session_idx" ON "wa_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "wa_messages_phone_dir_idx" ON "wa_messages" USING btree ("wa_phone","direction","created_at");--> statement-breakpoint
CREATE INDEX "wa_messages_status_idx" ON "wa_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "wa_messages_reply_to_idx" ON "wa_messages" USING btree ("in_reply_to");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_templates_name_idx" ON "wa_templates" USING btree ("name","language");--> statement-breakpoint
CREATE INDEX "notifications_staff_idx" ON "notifications" USING btree ("staff_id","created_at") WHERE "notifications"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_customer_idx" ON "notifications" USING btree ("customer_id","created_at") WHERE "notifications"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_staff_unread_idx" ON "notifications" USING btree ("staff_id") WHERE "notifications"."read_at" IS NULL AND "notifications"."archived_at" IS NULL AND "notifications"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_customer_unread_idx" ON "notifications" USING btree ("customer_id") WHERE "notifications"."read_at" IS NULL AND "notifications"."archived_at" IS NULL AND "notifications"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_entity_idx" ON "notifications" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key_idx" ON "notifications" USING btree ("dedupe_key") WHERE "notifications"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_channel_status_idx" ON "notification_deliveries" USING btree ("channel","status","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_type_idx" ON "notification_deliveries" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_staff_idx" ON "notification_deliveries" USING btree ("staff_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_customer_idx" ON "notification_deliveries" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_staff_idx" ON "notification_preferences" USING btree ("staff_id","category") WHERE "notification_preferences"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_customer_idx" ON "notification_preferences" USING btree ("customer_id","category") WHERE "notification_preferences"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_staff_idx" ON "notification_settings" USING btree ("staff_id") WHERE "notification_settings"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_customer_idx" ON "notification_settings" USING btree ("customer_id") WHERE "notification_settings"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_page_overrides_unique_idx" ON "staff_page_overrides" USING btree ("staff_id","route_path");--> statement-breakpoint
CREATE INDEX "staff_page_overrides_staff_idx" ON "staff_page_overrides" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_name_idx" ON "message_templates" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "sman"."audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "sman"."audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "sman"."audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "sman"."audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_staff_idx" ON "sman"."audit_logs" USING btree ("actor_staff_id","created_at") WHERE "sman"."audit_logs"."actor_staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "commissions_order_idx" ON "sman"."commissions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "commissions_customer_idx" ON "sman"."commissions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "commissions_status_idx" ON "sman"."commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commissions_depot_product_idx" ON "sman"."commissions" USING btree ("depot_id","product_id");--> statement-breakpoint
CREATE INDEX "customer_credits_customer_idx" ON "sman"."customer_credits" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_credits_order_idx" ON "sman"."customer_credits" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identities_provider_uid_idx" ON "sman"."customer_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identities_customer_provider_idx" ON "sman"."customer_identities" USING btree ("customer_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_trusted_devices_token_idx" ON "sman"."customer_trusted_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_trusted_devices_customer_idx" ON "sman"."customer_trusted_devices" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_passkeys_credential_idx" ON "sman"."customer_passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "customer_passkeys_customer_idx" ON "sman"."customer_passkeys" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webauthn_challenges_challenge_idx" ON "sman"."webauthn_challenges" USING btree ("challenge");--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expires_idx" ON "sman"."webauthn_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customer_licenses_customer_id_idx" ON "sman"."customer_licenses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_licenses_status_idx" ON "sman"."customer_licenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_otps_lookup_idx" ON "sman"."customer_otps" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_otps_sweep_idx" ON "sman"."customer_otps" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customer_otps_created_idx" ON "sman"."customer_otps" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dangote_requests_status_idx" ON "sman"."dangote_order_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dangote_requests_customer_idx" ON "sman"."dangote_order_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "dangote_products_status_idx" ON "sman"."dangote_products" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_notes_number_idx" ON "sman"."delivery_notes" USING btree ("delivery_note_number");--> statement-breakpoint
CREATE INDEX "delivery_notes_customer_idx" ON "sman"."delivery_notes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "delivery_notes_status_idx" ON "sman"."delivery_notes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "depot_price_history_parent_idx" ON "sman"."depot_price_history" USING btree ("depot_product_price_id");--> statement-breakpoint
CREATE UNIQUE INDEX "depot_product_cap_unique_idx" ON "sman"."depot_product_capacities" USING btree ("depot_id","product_id");--> statement-breakpoint
CREATE INDEX "depot_product_cap_depot_idx" ON "sman"."depot_product_capacities" USING btree ("depot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "depot_product_commission_unique_idx" ON "sman"."depot_product_commissions" USING btree ("depot_id","product_id");--> statement-breakpoint
CREATE INDEX "depot_product_commission_depot_idx" ON "sman"."depot_product_commissions" USING btree ("depot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "depot_staff_unique_idx" ON "sman"."depot_staff" USING btree ("depot_id","staff_id");--> statement-breakpoint
CREATE INDEX "depot_staff_depot_idx" ON "sman"."depot_staff" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "depot_staff_staff_idx" ON "sman"."depot_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_token_idx" ON "sman"."device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "device_tokens_staff_idx" ON "sman"."device_tokens" USING btree ("staff_id") WHERE "sman"."device_tokens"."disabled_at" IS NULL AND "sman"."device_tokens"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "device_tokens_customer_idx" ON "sman"."device_tokens" USING btree ("customer_id") WHERE "sman"."device_tokens"."disabled_at" IS NULL AND "sman"."device_tokens"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "device_tokens_device_idx" ON "sman"."device_tokens" USING btree ("device_id") WHERE "sman"."device_tokens"."device_id" <> '';--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_license_number_idx" ON "sman"."drivers" USING btree ("license_number");--> statement-breakpoint
CREATE INDEX "drivers_status_idx" ON "sman"."drivers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "drivers_truck_idx" ON "sman"."drivers" USING btree ("assigned_truck_ref");--> statement-breakpoint
CREATE INDEX "driver_truck_history_driver_idx" ON "sman"."driver_truck_history" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_truck_history_truck_idx" ON "sman"."driver_truck_history" USING btree ("truck_id");--> statement-breakpoint
CREATE INDEX "expected_payments_customer_status_idx" ON "sman"."expected_payments" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "expected_payments_order_idx" ON "sman"."expected_payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_idx" ON "sman"."sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_staff_idx" ON "sman"."sessions" USING btree ("staff_id","created_at") WHERE "sman"."sessions"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_customer_idx" ON "sman"."sessions" USING btree ("customer_id","created_at") WHERE "sman"."sessions"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "sman"."sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sman"."sessions" USING btree ("expires_at") WHERE "sman"."sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "lpg_station_staff_unique_idx" ON "sman"."lpg_station_staff" USING btree ("lpg_station_id","staff_id");--> statement-breakpoint
CREATE INDEX "lpg_station_staff_station_idx" ON "sman"."lpg_station_staff" USING btree ("lpg_station_id");--> statement-breakpoint
CREATE INDEX "lpg_station_staff_staff_idx" ON "sman"."lpg_station_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pfi_staff_unique_idx" ON "sman"."pfi_staff" USING btree ("pfi_id","staff_id");--> statement-breakpoint
CREATE INDEX "pfi_staff_pfi_idx" ON "sman"."pfi_staff" USING btree ("pfi_id");--> statement-breakpoint
CREATE INDEX "pfi_staff_staff_idx" ON "sman"."pfi_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_holds_order_idx" ON "sman"."wallet_holds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "wallet_holds_customer_status_idx" ON "sman"."wallet_holds" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "webhook_events_status_created_idx" ON "sman"."webhook_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_deposit_allocations_order_deposit_idx" ON "sman"."order_deposit_allocations" USING btree ("order_id","deposit_id");--> statement-breakpoint
CREATE INDEX "order_deposit_allocations_deposit_idx" ON "sman"."order_deposit_allocations" USING btree ("deposit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_idempotency_key_idx" ON "sman"."order_idempotency" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_name_idx" ON "sman"."vendors" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "pfi_expense_comments_expense_idx" ON "sman"."pfi_expense_comments" USING btree ("expense_id","created_at");--> statement-breakpoint
CREATE INDEX "lpg_station_cylinders_station_idx" ON "sman"."lpg_station_cylinders" USING btree ("lpg_station_id");--> statement-breakpoint
CREATE INDEX "lpg_price_history_station_idx" ON "sman"."lpg_price_history" USING btree ("lpg_station_id");--> statement-breakpoint
CREATE INDEX "lpg_requests_status_idx" ON "sman"."lpg_order_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lpg_requests_customer_idx" ON "sman"."lpg_order_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_page_overrides_unique_idx" ON "sman"."staff_page_overrides" USING btree ("staff_id","route_path");--> statement-breakpoint
CREATE INDEX "staff_page_overrides_staff_idx" ON "sman"."staff_page_overrides" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_password_resets_token_idx" ON "sman"."staff_password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_password_resets_staff_idx" ON "sman"."staff_password_resets" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "notifications_staff_idx" ON "sman"."notifications" USING btree ("staff_id","created_at") WHERE "sman"."notifications"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_customer_idx" ON "sman"."notifications" USING btree ("customer_id","created_at") WHERE "sman"."notifications"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_staff_unread_idx" ON "sman"."notifications" USING btree ("staff_id") WHERE "sman"."notifications"."read_at" IS NULL AND "sman"."notifications"."archived_at" IS NULL AND "sman"."notifications"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_customer_unread_idx" ON "sman"."notifications" USING btree ("customer_id") WHERE "sman"."notifications"."read_at" IS NULL AND "sman"."notifications"."archived_at" IS NULL AND "sman"."notifications"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_entity_idx" ON "sman"."notifications" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key_idx" ON "sman"."notifications" USING btree ("dedupe_key") WHERE "sman"."notifications"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "sman"."notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_channel_status_idx" ON "sman"."notification_deliveries" USING btree ("channel","status","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_type_idx" ON "sman"."notification_deliveries" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_staff_idx" ON "sman"."notification_deliveries" USING btree ("staff_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_customer_idx" ON "sman"."notification_deliveries" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_staff_idx" ON "sman"."notification_preferences" USING btree ("staff_id","category") WHERE "sman"."notification_preferences"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_customer_idx" ON "sman"."notification_preferences" USING btree ("customer_id","category") WHERE "sman"."notification_preferences"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_staff_idx" ON "sman"."notification_settings" USING btree ("staff_id") WHERE "sman"."notification_settings"."staff_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_customer_idx" ON "sman"."notification_settings" USING btree ("customer_id") WHERE "sman"."notification_settings"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_name_idx" ON "sman"."message_templates" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "wa_sessions_phone_idx" ON "sman"."wa_sessions" USING btree ("wa_phone");--> statement-breakpoint
CREATE INDEX "wa_sessions_expires_idx" ON "sman"."wa_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_messages_wamid_idx" ON "sman"."wa_messages" USING btree ("wamid") WHERE "sman"."wa_messages"."wamid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "wa_messages_session_idx" ON "sman"."wa_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "wa_messages_phone_dir_idx" ON "sman"."wa_messages" USING btree ("wa_phone","direction","created_at");--> statement-breakpoint
CREATE INDEX "wa_messages_status_idx" ON "sman"."wa_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "wa_messages_reply_to_idx" ON "sman"."wa_messages" USING btree ("in_reply_to");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_templates_name_idx" ON "sman"."wa_templates" USING btree ("name","language");