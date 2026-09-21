/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { PrintHistoryEntry } from '@shared/ipc/contract'
import type { PrintSettings } from '@shared/printSettings'
import type { CounterVariable } from '@shared/template/types'
import type { DataMigrationStatus } from '@shared/dataSettings'

export const LATEST_DATA_SCHEMA_VERSION = 1

export interface SerialReservation {
  id: string
  counterId: string
  values: number[]
  status: 'reserved' | 'committed' | 'released' | 'void'
}

export interface SerialRepository {
  peek(variable: CounterVariable, date?: Date): Promise<number>
  reserve(variable: CounterVariable, count: number, date?: Date): Promise<SerialReservation>
  commit(reservationId: string): Promise<void>
  fail(reservationId: string, policy: CounterVariable['failure']): Promise<void>
  reset(counterId: string, value: number): Promise<void>
}

export interface PrintHistoryRepository {
  append(entry: PrintHistoryEntry): Promise<void>
  list(limit?: number): Promise<PrintHistoryEntry[]>
}

export interface PromptValueRepository {
  read(templateId: string): Promise<Record<string, string>>
  write(templateId: string, values: Record<string, string>): Promise<void>
}

export interface PrinterProfileRepository {
  read(printerId: string): Promise<PrintSettings | null>
  write(printerId: string, settings: PrintSettings): Promise<void>
}

export type PrintTrackingStatus = 'printed' | 'reprinted' | 'voided' | 'failed'

export interface PrintTrackingRecord {
  dataSourceId: string
  recordKey: string
  status: PrintTrackingStatus
  lastPrintDate: string
  jobId: string
  serialUsed: string | null
  rowHash: string
  voidReason: string | null
}

export interface PrintTrackingRepository {
  read(dataSourceId: string, recordKey: string): Promise<PrintTrackingRecord | null>
  list(dataSourceId: string): Promise<PrintTrackingRecord[]>
  write(record: PrintTrackingRecord): Promise<void>
}

export interface TemplateLibraryEntry {
  id: string
  path: string
  title: string
  description: string
  tags: string[]
  status: 'draft' | 'approved'
  thumbnailPath: string | null
  modifiedAt: string
  indexedAt: string
}

export interface TemplateLibraryRepository {
  list(): Promise<TemplateLibraryEntry[]>
  upsert(entry: TemplateLibraryEntry): Promise<void>
  remove(id: string): Promise<void>
}

export interface DatabaseSettingRepository {
  read<T>(key: string): Promise<T | null>
  write(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export type MigrationStatus = DataMigrationStatus

export interface DatabaseDiagnosticInfo {
  migration: MigrationStatus
  rowCounts: Record<string, number>
  integrity: string
}

export interface MySqlConnectionConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  tls: boolean
  connectTimeoutMs?: number
  backupDirectory?: string
}

export type PostgreSqlConnectionConfig = MySqlConnectionConfig

export interface DataRepositories {
  serials: SerialRepository
  printHistory: PrintHistoryRepository
  promptValues: PromptValueRepository
  printerProfiles: PrinterProfileRepository
  printTracking: PrintTrackingRepository
  templateLibrary: TemplateLibraryRepository
  settings: DatabaseSettingRepository
  diagnosticInfo?(): Promise<DatabaseDiagnosticInfo>
  migrationStatus(): Promise<MigrationStatus>
  close(): Promise<void>
}
