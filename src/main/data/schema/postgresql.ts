/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { bigint, index, integer, pgTable, primaryKey, text, varchar } from 'drizzle-orm/pg-core'

export const counters = pgTable('counters', {
  counterId: varchar('counter_id', { length: 255 }).primaryKey(),
  nextValue: bigint('next_value', { mode: 'number' }).notNull(),
  resetKey: varchar('reset_key', { length: 64 }).notNull()
})
export const reservations = pgTable(
  'reservations',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    counterId: varchar('counter_id', { length: 255 }).notNull(),
    firstValue: bigint('first_value', { mode: 'number' }).notNull(),
    count: integer('count_value').notNull(),
    step: bigint('step_value', { mode: 'number' }).notNull(),
    nextValue: bigint('next_value', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    createdAt: varchar('created_at', { length: 32 }).notNull()
  },
  (table) => [index('reservations_counter_id').on(table.counterId)]
)
export const printHistory = pgTable(
  'print_history',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    date: varchar('date_value', { length: 32 }).notNull(),
    user: varchar('user_name', { length: 255 }).notNull(),
    computer: varchar('computer', { length: 255 }).notNull(),
    template: varchar('template_name', { length: 1024 }).notNull(),
    printer: varchar('printer', { length: 1024 }).notNull(),
    serialRange: varchar('serial_range', { length: 1024 }).notNull(),
    serializedLabels: integer('serialized_labels').notNull(),
    copies: integer('copies').notNull(),
    result: varchar('result', { length: 16 }).notNull(),
    error: text('error_text')
  },
  (table) => [index('print_history_date').on(table.date)]
)
export const promptValues = pgTable('prompt_values', {
  templateId: varchar('template_id', { length: 255 }).primaryKey(),
  valuesJson: text('values_json').notNull(),
  updatedAt: varchar('updated_at', { length: 32 }).notNull()
})
export const printerProfiles = pgTable('printer_profiles', {
  printerId: varchar('printer_id', { length: 255 }).primaryKey(),
  settingsJson: text('settings_json').notNull(),
  updatedAt: varchar('updated_at', { length: 32 }).notNull()
})
export const printTracking = pgTable(
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
export const templateLibrary = pgTable('template_library', {
  id: varchar('id', { length: 255 }).primaryKey(),
  path: text('path_value').notNull(),
  title: varchar('title', { length: 1024 }).notNull(),
  description: text('description_text').notNull(),
  tagsJson: text('tags_json').notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  thumbnailPath: text('thumbnail_path'),
  modifiedAt: varchar('modified_at', { length: 32 }).notNull(),
  indexedAt: varchar('indexed_at', { length: 32 }).notNull()
})
export const databaseSettings = pgTable('database_settings', {
  settingKey: varchar('setting_key', { length: 255 }).primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: varchar('updated_at', { length: 32 }).notNull()
})
export const schemaMigrations = pgTable('schema_migrations', {
  version: integer('version').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  appliedAt: varchar('applied_at', { length: 32 }).notNull()
})
