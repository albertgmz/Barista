/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
// Kept renderer-safe: this module is compiled into both TypeScript projects.
export interface WorkbookTableInfo {
  name: string
  sheet: string
  range: string
  headerRow: number
}

export interface WorkbookSourceInfo {
  path: string
  sheets: string[]
  tables: WorkbookTableInfo[]
}

export type RecordTrackingStatus = 'never-printed' | 'printed' | 'reprinted' | 'voided' | 'failed'

export interface DataSourceRecord {
  key: string
  values: Record<string, string>
  rowHash: string
  status: RecordTrackingStatus
  changed: boolean
  lastPrintDate: string | null
  jobId: string | null
  serialUsed: string | null
}

export interface DataSourceReadResult {
  sourceId: string
  path: string
  columns: string[]
  records: DataSourceRecord[]
  warnings: string[]
  modifiedAt: string
}

export interface DataSourceRecordSelection {
  dataSourceId: string
  key: string
  rowHash: string
  fields: Record<string, string>
}

export type RecordPickerFilter = 'all' | 'unprinted' | 'changed'

export function recordMatchesFilter(
  record: Pick<DataSourceRecord, 'status' | 'changed'>,
  filter: RecordPickerFilter
): boolean {
  if (filter === 'unprinted') return record.status === 'never-printed'
  if (filter === 'changed') return record.changed
  return true
}
