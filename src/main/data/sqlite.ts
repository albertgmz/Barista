/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { printSettingsSchema } from '@shared/printSettings'
import type { PrintHistoryEntry } from '@shared/ipc/contract'
import type { PrintSettings } from '@shared/printSettings'
import { counterResetKey, counterValue } from '@shared/variables'
import type { CounterVariable } from '@shared/template/types'
import type {
  DatabaseSettingRepository,
  DataRepositories,
  MigrationStatus,
  PrinterProfileRepository,
  PrintHistoryRepository,
  PrintTrackingRecord,
  PrintTrackingRepository,
  PromptValueRepository,
  SerialReservation,
  SerialRepository,
  TemplateLibraryEntry,
  TemplateLibraryRepository
} from './types'
import {
  parsePrintHistoryEntry,
  parsePrintTrackingRecord,
  parseTemplateLibraryEntry
} from './validation'
import { databaseSettings } from './schema/sqlite'
import { idempotentInitialMigration, readGeneratedMigrationSync } from './drizzleMigrations'

type SqliteOrm = ReturnType<typeof drizzle>

interface CounterRow {
  next_value: number
  reset_key: string
}

interface ReservationRow {
  counter_id: string
  first_value: number
  next_value: number
  status: SerialReservation['status']
}

interface IntegrityRow {
  integrity_check: string
}

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial-drizzle-schema',
    statements: readGeneratedMigrationSync('sqlite')
  }
] as const

function sqliteTimestamp(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

class SqliteSerialRepository implements SerialRepository {
  constructor(private readonly database: DatabaseSync) {}

  private key(variable: CounterVariable): string {
    return variable.scope === 'global' && variable.sharedName
      ? `shared:${variable.sharedName}`
      : `template:${variable.id}`
  }

  async peek(variable: CounterVariable, date = new Date()): Promise<number> {
    const row = this.database
      .prepare('SELECT next_value, reset_key FROM counters WHERE counter_id = ?')
      .get(this.key(variable)) as CounterRow | undefined
    return !row || row.reset_key !== counterResetKey(variable.reset, date)
      ? variable.start
      : row.next_value
  }

  async reserve(
    variable: CounterVariable,
    count: number,
    date = new Date()
  ): Promise<SerialReservation> {
    if (!Number.isInteger(count) || count < 1 || count > 1_000_000)
      throw new Error('Reservation count must be between 1 and 1,000,000.')
    const counterId = this.key(variable)
    const period = counterResetKey(variable.reset, date)
    const id = randomUUID()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const row = this.database
        .prepare('SELECT next_value, reset_key FROM counters WHERE counter_id = ?')
        .get(counterId) as CounterRow | undefined
      const first = !row || row.reset_key !== period ? variable.start : row.next_value
      const values = Array.from({ length: count }, (_, index) =>
        counterValue(variable, index, first)
      )
      const next =
        variable.overflow === 'wrap'
          ? counterValue(variable, count, first)
          : first + variable.step * count
      this.database
        .prepare(
          `INSERT INTO counters(counter_id, next_value, reset_key) VALUES (?, ?, ?)
           ON CONFLICT(counter_id) DO UPDATE SET
             next_value=excluded.next_value, reset_key=excluded.reset_key`
        )
        .run(counterId, next, period)
      this.database
        .prepare(
          `INSERT INTO reservations(
             id, counter_id, first_value, count, step, next_value, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?)`
        )
        .run(id, counterId, first, count, variable.step, next, new Date().toISOString())
      this.database.exec('COMMIT')
      return { id, counterId, values, status: 'reserved' }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  async commit(reservationId: string): Promise<void> {
    const result = this.database
      .prepare("UPDATE reservations SET status='committed' WHERE id=? AND status='reserved'")
      .run(reservationId)
    if (result.changes !== 1) throw new Error('Serial reservation is not available to commit.')
  }

  async fail(reservationId: string, policy: CounterVariable['failure']): Promise<void> {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const reservation = this.database
        .prepare('SELECT counter_id, first_value, next_value, status FROM reservations WHERE id=?')
        .get(reservationId) as ReservationRow | undefined
      if (!reservation || reservation.status !== 'reserved')
        throw new Error('Serial reservation is not available to fail.')
      let status: SerialReservation['status'] = 'void'
      if (policy === 'release') {
        const current = this.database
          .prepare('SELECT next_value, reset_key FROM counters WHERE counter_id=?')
          .get(reservation.counter_id) as CounterRow | undefined
        if (current?.next_value === reservation.next_value) {
          this.database
            .prepare('UPDATE counters SET next_value=? WHERE counter_id=?')
            .run(reservation.first_value, reservation.counter_id)
          status = 'released'
        }
      }
      this.database
        .prepare('UPDATE reservations SET status=? WHERE id=?')
        .run(status, reservationId)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  async reset(counterId: string, value: number): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO counters(counter_id, next_value, reset_key) VALUES (?, ?, 'never')
         ON CONFLICT(counter_id) DO UPDATE SET
           next_value=excluded.next_value, reset_key=excluded.reset_key`
      )
      .run(counterId, value)
  }
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`Stored ${label} is corrupt.`, { cause: error })
  }
}

function parseStringRecord(value: string): Record<string, string> {
  const parsed = parseJson(value, 'prompt values')
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.values(parsed).some((item) => typeof item !== 'string')
  )
    throw new Error('Stored prompt values are corrupt.')
  return parsed as Record<string, string>
}

class SqlitePrintHistoryRepository implements PrintHistoryRepository {
  constructor(private readonly database: DatabaseSync) {}

  async append(entry: PrintHistoryEntry): Promise<void> {
    const checked = parsePrintHistoryEntry(entry)
    this.database
      .prepare(
        `INSERT OR IGNORE INTO print_history(
           id, date, user_name, computer, template, printer, serial_range,
           serialized_labels, copies, result, error
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        checked.id,
        checked.date,
        checked.user,
        checked.computer,
        checked.template,
        checked.printer,
        checked.serialRange,
        checked.serializedLabels,
        checked.copies,
        checked.result,
        checked.error ?? null
      )
  }

  async list(limit = 5000): Promise<PrintHistoryEntry[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000)
      throw new Error('History limit must be between 1 and 5,000.')
    const rows = this.database
      .prepare(
        `SELECT id, date, user_name, computer, template, printer, serial_range,
                serialized_labels, copies, result, error
         FROM print_history ORDER BY date DESC, id DESC LIMIT ?`
      )
      .all(limit) as Array<{
      id: string
      date: string
      user_name: string
      computer: string
      template: string
      printer: string
      serial_range: string
      serialized_labels: number
      copies: number
      result: PrintHistoryEntry['result']
      error: string | null
    }>
    return rows.map((row) =>
      parsePrintHistoryEntry({
        id: row.id,
        date: row.date,
        user: row.user_name,
        computer: row.computer,
        template: row.template,
        printer: row.printer,
        serialRange: row.serial_range,
        serializedLabels: row.serialized_labels,
        copies: row.copies,
        result: row.result,
        ...(row.error ? { error: row.error } : {})
      })
    )
  }
}

class SqlitePromptValueRepository implements PromptValueRepository {
  constructor(private readonly database: DatabaseSync) {}

  async read(templateId: string): Promise<Record<string, string>> {
    const row = this.database
      .prepare('SELECT values_json FROM prompt_values WHERE template_id=?')
      .get(templateId) as { values_json: string } | undefined
    return row ? parseStringRecord(row.values_json) : {}
  }

  async write(templateId: string, values: Record<string, string>): Promise<void> {
    const checked = parseStringRecord(JSON.stringify(values))
    this.database
      .prepare(
        `INSERT INTO prompt_values(template_id, values_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(template_id) DO UPDATE SET
           values_json=excluded.values_json, updated_at=excluded.updated_at`
      )
      .run(templateId, JSON.stringify(checked), new Date().toISOString())
  }
}

class SqlitePrinterProfileRepository implements PrinterProfileRepository {
  constructor(private readonly database: DatabaseSync) {}

  async read(printerId: string): Promise<PrintSettings | null> {
    const row = this.database
      .prepare('SELECT settings_json FROM printer_profiles WHERE printer_id=?')
      .get(printerId) as { settings_json: string } | undefined
    return row ? printSettingsSchema.parse(parseJson(row.settings_json, 'printer profile')) : null
  }

  async write(printerId: string, settings: PrintSettings): Promise<void> {
    const checked = printSettingsSchema.parse(settings)
    this.database
      .prepare(
        `INSERT INTO printer_profiles(printer_id, settings_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(printer_id) DO UPDATE SET
           settings_json=excluded.settings_json, updated_at=excluded.updated_at`
      )
      .run(printerId, JSON.stringify(checked), new Date().toISOString())
  }
}

class SqlitePrintTrackingRepository implements PrintTrackingRepository {
  constructor(private readonly database: DatabaseSync) {}

  async read(dataSourceId: string, recordKey: string): Promise<PrintTrackingRecord | null> {
    const row = this.database
      .prepare(
        `SELECT data_source_id, record_key, status, last_print_date, job_id, serial_used,
                row_hash, void_reason
         FROM data_source_tracking WHERE data_source_id=? AND record_key=?`
      )
      .get(dataSourceId, recordKey) as TrackingRow | undefined
    return row ? parsePrintTrackingRecord(trackingRecord(row)) : null
  }

  async list(dataSourceId: string): Promise<PrintTrackingRecord[]> {
    const rows = this.database
      .prepare(
        `SELECT data_source_id, record_key, status, last_print_date, job_id, serial_used,
                row_hash, void_reason
         FROM data_source_tracking WHERE data_source_id=? ORDER BY record_key`
      )
      .all(dataSourceId) as unknown as TrackingRow[]
    return rows.map((row) => parsePrintTrackingRecord(trackingRecord(row)))
  }

  async write(record: PrintTrackingRecord): Promise<void> {
    const checked = parsePrintTrackingRecord(record)
    this.database
      .prepare(
        `INSERT INTO data_source_tracking(
           data_source_id, record_key, status, last_print_date, job_id, serial_used,
           row_hash, void_reason, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(data_source_id, record_key) DO UPDATE SET
           status=excluded.status, last_print_date=excluded.last_print_date,
           job_id=excluded.job_id, serial_used=excluded.serial_used,
           row_hash=excluded.row_hash, void_reason=excluded.void_reason,
           updated_at=excluded.updated_at`
      )
      .run(
        checked.dataSourceId,
        checked.recordKey,
        checked.status,
        checked.lastPrintDate,
        checked.jobId,
        checked.serialUsed,
        checked.rowHash,
        checked.voidReason,
        new Date().toISOString()
      )
  }
}

interface TrackingRow {
  data_source_id: string
  record_key: string
  status: PrintTrackingRecord['status']
  last_print_date: string
  job_id: string
  serial_used: string | null
  row_hash: string
  void_reason: string | null
}

function trackingRecord(row: TrackingRow): PrintTrackingRecord {
  return {
    dataSourceId: row.data_source_id,
    recordKey: row.record_key,
    status: row.status,
    lastPrintDate: row.last_print_date,
    jobId: row.job_id,
    serialUsed: row.serial_used,
    rowHash: row.row_hash,
    voidReason: row.void_reason
  }
}

class SqliteTemplateLibraryRepository implements TemplateLibraryRepository {
  constructor(private readonly database: DatabaseSync) {}

  async list(): Promise<TemplateLibraryEntry[]> {
    const rows = this.database
      .prepare(
        `SELECT id, path, title, description, tags_json, status, thumbnail_path,
                modified_at, indexed_at FROM template_library ORDER BY title, path`
      )
      .all() as unknown as Array<{
      id: string
      path: string
      title: string
      description: string
      tags_json: string
      status: TemplateLibraryEntry['status']
      thumbnail_path: string | null
      modified_at: string
      indexed_at: string
    }>
    return rows.map((row) => {
      const tags = parseJson(row.tags_json, 'template tags')
      if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))
        throw new Error('Stored template tags are corrupt.')
      return parseTemplateLibraryEntry({
        id: row.id,
        path: row.path,
        title: row.title,
        description: row.description,
        tags,
        status: row.status,
        thumbnailPath: row.thumbnail_path,
        modifiedAt: row.modified_at,
        indexedAt: row.indexed_at
      })
    })
  }

  async upsert(entry: TemplateLibraryEntry): Promise<void> {
    const checked = parseTemplateLibraryEntry(entry)
    this.database
      .prepare(
        `INSERT INTO template_library(
           id, path, title, description, tags_json, status, thumbnail_path, modified_at, indexed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           path=excluded.path, title=excluded.title, description=excluded.description,
           tags_json=excluded.tags_json, status=excluded.status,
           thumbnail_path=excluded.thumbnail_path, modified_at=excluded.modified_at,
           indexed_at=excluded.indexed_at`
      )
      .run(
        checked.id,
        checked.path,
        checked.title,
        checked.description,
        JSON.stringify(checked.tags),
        checked.status,
        checked.thumbnailPath,
        checked.modifiedAt,
        checked.indexedAt
      )
  }

  async remove(id: string): Promise<void> {
    this.database.prepare('DELETE FROM template_library WHERE id=?').run(id)
  }
}

class SqliteDatabaseSettingRepository implements DatabaseSettingRepository {
  constructor(private readonly database: SqliteOrm) {}

  async read<T>(key: string): Promise<T | null> {
    const row = this.database
      .select({ valueJson: databaseSettings.valueJson })
      .from(databaseSettings)
      .where(eq(databaseSettings.settingKey, key))
      .get()
    return row ? (parseJson(row.valueJson, `database setting ${key}`) as T) : null
  }

  async write(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) throw new Error('Database setting must be JSON serializable.')
    this.database
      .insert(databaseSettings)
      .values({ settingKey: key, valueJson: serialized, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: databaseSettings.settingKey,
        set: { valueJson: serialized, updatedAt: new Date().toISOString() }
      })
      .run()
  }

  async remove(key: string): Promise<void> {
    this.database.delete(databaseSettings).where(eq(databaseSettings.settingKey, key)).run()
  }
}

export class SqliteDataRepositories implements DataRepositories {
  private readonly database: DatabaseSync
  private readonly orm: SqliteOrm
  private readonly status: MigrationStatus
  readonly serials: SerialRepository
  readonly printHistory: PrintHistoryRepository
  readonly promptValues: PromptValueRepository
  readonly printerProfiles: PrinterProfileRepository
  readonly printTracking: PrintTrackingRepository
  readonly templateLibrary: TemplateLibraryRepository
  readonly settings: DatabaseSettingRepository

  constructor(path: string) {
    const existed = existsSync(path)
    mkdirSync(dirname(path), { recursive: true })
    this.database = new DatabaseSync(path)
    this.orm = drizzle({ client: this.database })
    try {
      this.database.exec(
        'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;'
      )
      const integrity = this.database
        .prepare('PRAGMA integrity_check')
        .get() as unknown as IntegrityRow
      if (integrity.integrity_check !== 'ok')
        throw new Error(`SQLite integrity check failed: ${integrity.integrity_check}`)
    } catch (error) {
      this.database.close()
      throw error
    }
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
      );`)
    const applied = (
      this.database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
        version: number
      }[]
    ).map((row) => row.version)
    const pending = MIGRATIONS.filter((migration) => !applied.includes(migration.version))
    let backupPath: string | null = null
    if (existed && pending.length > 0) {
      this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      backupPath = `${path}.backup-${sqliteTimestamp()}`
      copyFileSync(path, backupPath)
    }
    for (const migration of pending) {
      this.database.exec('BEGIN IMMEDIATE')
      try {
        for (const statement of migration.statements)
          this.database.exec(idempotentInitialMigration(statement))
        this.database
          .prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)')
          .run(migration.version, migration.name, new Date().toISOString())
        this.database.exec('COMMIT')
      } catch (error) {
        this.database.exec('ROLLBACK')
        this.database.close()
        throw error
      }
    }
    const allApplied = [...applied, ...pending.map((migration) => migration.version)].sort(
      (a, b) => a - b
    )
    this.status = {
      engine: 'sqlite',
      currentVersion: allApplied.at(-1) ?? 0,
      latestVersion: MIGRATIONS.at(-1)?.version ?? 0,
      applied: allApplied,
      pending: [],
      integrity: 'ok',
      backupPath
    }
    this.serials = new SqliteSerialRepository(this.database)
    this.printHistory = new SqlitePrintHistoryRepository(this.database)
    this.promptValues = new SqlitePromptValueRepository(this.database)
    this.printerProfiles = new SqlitePrinterProfileRepository(this.database)
    this.printTracking = new SqlitePrintTrackingRepository(this.database)
    this.templateLibrary = new SqliteTemplateLibraryRepository(this.database)
    this.settings = new SqliteDatabaseSettingRepository(this.orm)
  }

  async migrationStatus(): Promise<MigrationStatus> {
    return structuredClone(this.status)
  }

  async diagnosticInfo(): Promise<import('./types').DatabaseDiagnosticInfo> {
    const tables = [
      'counters',
      'reservations',
      'print_history',
      'prompt_values',
      'printer_profiles',
      'data_source_tracking',
      'template_library',
      'database_settings',
      'schema_migrations'
    ] as const
    const rowCounts = Object.fromEntries(
      tables.map((table) => [
        table,
        Number(
          (
            this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
              count: number
            }
          ).count
        )
      ])
    )
    const integrity = (
      this.database.prepare('PRAGMA integrity_check').get() as unknown as IntegrityRow
    ).integrity_check
    return { migration: await this.migrationStatus(), rowCounts, integrity }
  }

  async close(): Promise<void> {
    this.database.close()
  }
}
