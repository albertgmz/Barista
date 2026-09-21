CREATE TABLE `counters` (
	`counter_id` text PRIMARY KEY,
	`next_value` integer NOT NULL,
	`reset_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `database_settings` (
	`setting_key` text PRIMARY KEY,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `print_history` (
	`id` text PRIMARY KEY,
	`date` text NOT NULL,
	`user_name` text NOT NULL,
	`computer` text NOT NULL,
	`template` text NOT NULL,
	`printer` text NOT NULL,
	`serial_range` text NOT NULL,
	`serialized_labels` integer NOT NULL,
	`copies` integer NOT NULL,
	`result` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `data_source_tracking` (
	`data_source_id` text NOT NULL,
	`record_key` text NOT NULL,
	`status` text NOT NULL,
	`last_print_date` text NOT NULL,
	`job_id` text NOT NULL,
	`serial_used` text,
	`row_hash` text NOT NULL,
	`void_reason` text,
	`updated_at` text NOT NULL,
	CONSTRAINT `data_source_tracking_pk` PRIMARY KEY(`data_source_id`, `record_key`)
);
--> statement-breakpoint
CREATE TABLE `printer_profiles` (
	`printer_id` text PRIMARY KEY,
	`settings_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_values` (
	`template_id` text PRIMARY KEY,
	`values_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY,
	`counter_id` text NOT NULL,
	`first_value` integer NOT NULL,
	`count` integer NOT NULL,
	`step` integer NOT NULL,
	`next_value` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schema_migrations` (
	`version` integer PRIMARY KEY,
	`name` text NOT NULL,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `template_library` (
	`id` text PRIMARY KEY,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`tags_json` text NOT NULL,
	`status` text NOT NULL,
	`thumbnail_path` text,
	`modified_at` text NOT NULL,
	`indexed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `print_history_date` ON `print_history` (`date`);--> statement-breakpoint
CREATE INDEX `reservations_counter_id` ON `reservations` (`counter_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `template_library_path` ON `template_library` (`path`);