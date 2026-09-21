/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const counters = sqliteTable('counters', {
  counterId: text('counter_id').primaryKey(),
  nextValue: integer('next_value').notNull(),
  resetKey: text('reset_key').notNull()
})
export const reservations = sqliteTable(
  'reservations',
  {
    id: text('id').primaryKey(),
    counterId: text('counter_id').notNull(),
    firstValue: integer('first_value').notNull(),
    count: integer('count').notNull(),
    step: integer('step').notNull(),
    nextValue: integer('next_value').notNull(),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull()
  },
  (table) => [index('reservations_counter_id').on(table.counterId)]
)
export const printHistory = sqliteTable(
  'print_history',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    user: text('user_name').notNull(),
    computer: text('computer').notNull(),
    template: text('template').notNull(),
    printer: text('printer').notNull(),
    serialRange: text('serial_range').notNull(),
    serializedLabels: integer('serialized_labels').notNull(),
    copies: integer('copies').notNull(),
    result: text('result').notNull(),
    error: text('error')
  },
  (table) => [index('print_history_date').on(table.date)]
)
export const promptValues = sqliteTable('prompt_values', {
  templateId: text('template_id').primaryKey(),
  valuesJson: text('values_json').notNull(),
  updatedAt: text('updated_at').notNull()
})
export const printerProfiles = sqliteTable('printer_profiles', {
  printerId: text('printer_id').primaryKey(),
  settingsJson: text('settings_json').notNull(),
  updatedAt: text('updated_at').notNull()
})
export const printTracking = sqliteTable(
  'data_source_tracking',
  {
    dataSourceId: text('data_source_id').notNull(),
    recordKey: text('record_key').notNull(),
    status: text('status').notNull(),
    lastPrintDate: text('last_print_date').notNull(),
    jobId: text('job_id').notNull(),
    serialUsed: text('serial_used'),
    rowHash: text('row_hash').notNull(),
    voidReason: text('void_reason'),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [primaryKey({ columns: [table.dataSourceId, table.recordKey] })]
)
export const templateLibrary = sqliteTable(
  'template_library',
  {
    id: text('id').primaryKey(),
    path: text('path').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    tagsJson: text('tags_json').notNull(),
    status: text('status').notNull(),
    thumbnailPath: text('thumbnail_path'),
    modifiedAt: text('modified_at').notNull(),
    indexedAt: text('indexed_at').notNull()
  },
  (table) => [uniqueIndex('template_library_path').on(table.path)]
)
export const databaseSettings = sqliteTable('database_settings', {
  settingKey: text('setting_key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull()
})
export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  name: text('name').notNull(),
  appliedAt: text('applied_at').notNull()
})
