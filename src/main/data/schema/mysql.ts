/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import {
  bigint,
  index,
  int,
  longtext,
  mysqlTable,
  primaryKey,
  text,
  varchar
} from 'drizzle-orm/mysql-core'

export const counters = mysqlTable('counters', {
  counterId: varchar('counter_id', { length: 255 }).primaryKey(),
  nextValue: bigint('next_value', { mode: 'number' }).notNull(),
  resetKey: varchar('reset_key', { length: 64 }).notNull()
})
export const reservations = mysqlTable(
  'reservations',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    counterId: varchar('counter_id', { length: 255 }).notNull(),
    firstValue: bigint('first_value', { mode: 'number' }).notNull(),
    count: int('count_value').notNull(),
    step: bigint('step_value', { mode: 'number' }).notNull(),
    nextValue: bigint('next_value', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    createdAt: varchar('created_at', { length: 32 }).notNull()
  },
  (table) => [index('reservations_counter_id').on(table.counterId)]
)
export const printHistory = mysqlTable(
  'print_history',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    date: varchar('date_value', { length: 32 }).notNull(),
    user: varchar('user_name', { length: 255 }).notNull(),
    computer: varchar('computer', { length: 255 }).notNull(),
    template: varchar('template_name', { length: 1024 }).notNull(),
    printer: varchar('printer', { length: 1024 }).notNull(),
    serialRange: varchar('serial_range', { length: 1024 }).notNull(),
    serializedLabels: int('serialized_labels').notNull(),
    copies: int('copies').notNull(),
    result: varchar('result', { length: 16 }).notNull(),
    error: text('error_text')
  },
  (table) => [index('print_history_date').on(table.date)]
)
export const promptValues = mysqlTable('prompt_values', {
  templateId: varchar('template_id', { length: 255 }).primaryKey(),
  valuesJson: longtext('values_json').notNull(),
  updatedAt: varchar('updated_at', { length: 32 }).notNull()
})
export const printerProfiles = mysqlTable('printer_profiles', {
  printerId: varchar('printer_id', { length: 255 }).primaryKey(),
  settingsJson: longtext('settings_json').notNull(),
  updatedAt: varchar('updated_at', { length: 32 }).notNull()
})
export const printTracking = mysqlTable(
  'data_source_tracking',
  {
    dataSourceId: varchar('data_source_id', { length: 255 }).notNull(),
    recordKey: varchar('record_key', { length: 512 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    lastPrintDate: varchar('last_print_date', { length: 32 }).notNull(),
    jobId: varchar('job_id', { length: 255 }).notNull(),
    serialUsed: varchar('serial_used', { length: 255 }),
    rowHash: varchar('row_hash', { length: 128 }).notNull(),
    voidReason: text('void_reason'),
    updatedAt: varchar('updated_at', { length: 32 }).notNull()
  },
  (table) => [primaryKey({ columns: [table.dataSourceId, table.recordKey] })]
)
export const templateLibrary = mysqlTable('template_library', {
  id: varchar('id', { length: 255 }).primaryKey(),
  path: text('path_value').notNull(),
  title: varchar('title', { length: 1024 }).notNull(),
  description: text('description_text').notNull(),
  tagsJson: longtext('tags_json').notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  thumbnailPath: text('thumbnail_path'),
  modifiedAt: varchar('modified_at', { length: 32 }).notNull(),
  indexedAt: varchar('indexed_at', { length: 32 }).notNull()
})
export const databaseSettings = mysqlTable('database_settings', {
  settingKey: varchar('setting_key', { length: 255 }).primaryKey(),
  valueJson: longtext('value_json').notNull(),
  updatedAt: varchar('updated_at', { length: 32 }).notNull()
})
export const schemaMigrations = mysqlTable('schema_migrations', {
  version: int('version').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  appliedAt: varchar('applied_at', { length: 32 }).notNull()
})
