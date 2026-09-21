CREATE TABLE "counters" (
	"counter_id" varchar(255) PRIMARY KEY,
	"next_value" bigint NOT NULL,
	"reset_key" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_settings" (
	"setting_key" varchar(255) PRIMARY KEY,
	"value_json" text NOT NULL,
	"updated_at" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_history" (
	"id" varchar(255) PRIMARY KEY,
	"date_value" varchar(32) NOT NULL,
	"user_name" varchar(255) NOT NULL,
	"computer" varchar(255) NOT NULL,
	"template_name" varchar(1024) NOT NULL,
	"printer" varchar(1024) NOT NULL,
	"serial_range" varchar(1024) NOT NULL,
	"serialized_labels" integer NOT NULL,
	"copies" integer NOT NULL,
	"result" varchar(16) NOT NULL,
	"error_text" text
);
--> statement-breakpoint
CREATE TABLE "data_source_tracking" (
	"data_source_id" varchar(255),
	"record_key" varchar(512),
	"status" varchar(16) NOT NULL,
	"last_print_date" varchar(32) NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"serial_used" varchar(255),
	"row_hash" varchar(128) NOT NULL,
	"void_reason" text,
	"updated_at" varchar(32) NOT NULL,
	CONSTRAINT "data_source_tracking_pkey" PRIMARY KEY("data_source_id","record_key")
);
--> statement-breakpoint
CREATE TABLE "printer_profiles" (
	"printer_id" varchar(255) PRIMARY KEY,
	"settings_json" text NOT NULL,
	"updated_at" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_values" (
	"template_id" varchar(255) PRIMARY KEY,
	"values_json" text NOT NULL,
	"updated_at" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" varchar(64) PRIMARY KEY,
	"counter_id" varchar(255) NOT NULL,
	"first_value" bigint NOT NULL,
	"count_value" integer NOT NULL,
	"step_value" bigint NOT NULL,
	"next_value" bigint NOT NULL,
	"status" varchar(16) NOT NULL,
	"created_at" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_migrations" (
	"version" integer PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"applied_at" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_library" (
	"id" varchar(255) PRIMARY KEY,
	"path_value" text NOT NULL,
	"title" varchar(1024) NOT NULL,
	"description_text" text NOT NULL,
	"tags_json" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"thumbnail_path" text,
	"modified_at" varchar(32) NOT NULL,
	"indexed_at" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "print_history_date" ON "print_history" ("date_value");--> statement-breakpoint
CREATE INDEX "reservations_counter_id" ON "reservations" ("counter_id");