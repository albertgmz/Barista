/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { randomUUID } from 'node:crypto'
import mysql from 'mysql2'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/mysql2'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { PrintHistoryEntry } from '@shared/ipc/contract'
import { printSettingsSchema, type PrintSettings } from '@shared/printSettings'
import type { CounterVariable } from '@shared/template/types'
import { counterResetKey, counterValue } from '@shared/variables'
import {
  parsePrintHistoryEntry,
  parsePrintTrackingRecord,
  parseTemplateLibraryEntry
} from './validation'
import type {
  DataRepositories,
  DatabaseSettingRepository,
  MigrationStatus,
  MySqlConnectionConfig,
  PrinterProfileRepository,
  PrintHistoryRepository,
  PrintTrackingRecord,
  PrintTrackingRepository,
  PromptValueRepository,
  SerialRepository,
  SerialReservation,
  TemplateLibraryEntry,
  TemplateLibraryRepository
} from './types'
import { databaseSettings } from './schema/mysql'
import { writeMigrationBackup } from './migrationBackup'
import { idempotentInitialMigration, readGeneratedMigration } from './drizzleMigrations'

type MySqlOrm = MySql2Database

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

class MySqlSerialRepository implements SerialRepository {
  constructor(private readonly pool: Pool) {}

  private key(variable: CounterVariable): string {
    return variable.scope === 'global' && variable.sharedName
      ? `shared:${variable.sharedName}`
      : `template:${variable.id}`
  }

  async peek(variable: CounterVariable, date = new Date()): Promise<number> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT next_value, reset_key FROM counters WHERE counter_id = ?',
      [this.key(variable)]
    )
    const row = rows[0] as { next_value: number; reset_key: string } | undefined
    return !row || row.reset_key !== counterResetKey(variable.reset, date)
      ? variable.start
      : Number(row.next_value)
  }

  async reserve(
    variable: CounterVariable,
    count: number,
    date = new Date()
  ): Promise<SerialReservation> {
    if (!Number.isInteger(count) || count < 1 || count > 1_000_000)
      throw new Error('Reservation count must be between 1 and 1,000,000.')
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const counterId = this.key(variable)
      const period = counterResetKey(variable.reset, date)
      await connection.execute(
        `INSERT INTO counters(counter_id, next_value, reset_key) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE counter_id=VALUES(counter_id)`,
        [counterId, variable.start, period]
      )
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT next_value, reset_key FROM counters WHERE counter_id = ? FOR UPDATE',
        [counterId]
      )
      const row = rows[0] as { next_value: number; reset_key: string }
      const first = row.reset_key === period ? Number(row.next_value) : variable.start
      const values = Array.from({ length: count }, (_, index) =>
        counterValue(variable, index, first)
      )
      const next =
        variable.overflow === 'wrap'
          ? counterValue(variable, count, first)
          : first + variable.step * count
      await connection.execute('UPDATE counters SET next_value=?, reset_key=? WHERE counter_id=?', [
        next,
        period,
        counterId
      ])
      const id = randomUUID()
      await connection.execute(
        `INSERT INTO reservations(
           id, counter_id, \`first_value\`, count_value, step_value, next_value, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?)`,
        [id, counterId, first, count, variable.step, next, new Date().toISOString()]
      )
      await connection.commit()
      return { id, counterId, values, status: 'reserved' }
    } catch (error) {
      await safeRollback(connection)
      throw error
    } finally {
      connection.release()
    }
  }

  async commit(reservationId: string): Promise<void> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE reservations SET status='committed' WHERE id=? AND status='reserved'",
      [reservationId]
    )
    if (result.affectedRows !== 1) throw new Error('Serial reservation is not available to commit.')
  }

  async fail(reservationId: string, policy: CounterVariable['failure']): Promise<void> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT counter_id, \`first_value\`, next_value, status
         FROM reservations WHERE id=? FOR UPDATE`,
        [reservationId]
      )
      const reservation = rows[0] as
        | {
            counter_id: string
            first_value: number
            next_value: number
            status: SerialReservation['status']
          }
        | undefined
      if (!reservation || reservation.status !== 'reserved')
        throw new Error('Serial reservation is not available to fail.')
      let status: SerialReservation['status'] = 'void'
      if (policy === 'release') {
        const [counterRows] = await connection.execute<RowDataPacket[]>(
          'SELECT next_value FROM counters WHERE counter_id=? FOR UPDATE',
          [reservation.counter_id]
        )
        const current = counterRows[0] as { next_value: number } | undefined
        if (current && Number(current.next_value) === Number(reservation.next_value)) {
          await connection.execute('UPDATE counters SET next_value=? WHERE counter_id=?', [
            reservation.first_value,
            reservation.counter_id
          ])
          status = 'released'
        }
      }
      await connection.execute('UPDATE reservations SET status=? WHERE id=?', [
        status,
        reservationId
      ])
      await connection.commit()
    } catch (error) {
      await safeRollback(connection)
      throw error
    } finally {
      connection.release()
    }
  }

  async reset(counterId: string, value: number): Promise<void> {
    await this.pool.execute(
      `INSERT INTO counters(counter_id, next_value, reset_key) VALUES (?, ?, 'never')
       ON DUPLICATE KEY UPDATE next_value=VALUES(next_value), reset_key=VALUES(reset_key)`,
      [counterId, value]
    )
  }
}

async function safeRollback(connection: PoolConnection): Promise<void> {
  try {
    await connection.rollback()
  } catch {
    // Preserve the original transaction failure.
  }
}

class MySqlPrintHistoryRepository implements PrintHistoryRepository {
  constructor(private readonly pool: Pool) {}

  async append(entry: PrintHistoryEntry): Promise<void> {
    const checked = parsePrintHistoryEntry(entry)
    await this.pool.execute(
      `INSERT IGNORE INTO print_history(
         id, date_value, user_name, computer, template_name, printer, serial_range,
         serialized_labels, copies, result, error_text
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
      ]
    )
  }

  async list(limit = 5000): Promise<PrintHistoryEntry[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000)
      throw new Error('History limit must be between 1 and 5,000.')
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id, date_value, user_name, computer, template_name, printer, serial_range,
              serialized_labels, copies, result, error_text
       FROM print_history ORDER BY date_value DESC, id DESC LIMIT ?`,
      [limit]
    )
    return rows.map((value) => {
      const row = value as {
        id: string
        date_value: string
        user_name: string
        computer: string
        template_name: string
        printer: string
        serial_range: string
        serialized_labels: number
        copies: number
        result: PrintHistoryEntry['result']
        error_text: string | null
      }
      return parsePrintHistoryEntry({
        id: row.id,
        date: row.date_value,
        user: row.user_name,
        computer: row.computer,
        template: row.template_name,
        printer: row.printer,
        serialRange: row.serial_range,
        serializedLabels: row.serialized_labels,
        copies: row.copies,
        result: row.result,
        ...(row.error_text ? { error: row.error_text } : {})
      })
    })
  }
}

class MySqlPromptValueRepository implements PromptValueRepository {
  constructor(private readonly pool: Pool) {}
  async read(templateId: string): Promise<Record<string, string>> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT values_json FROM prompt_values WHERE template_id=?',
      [templateId]
    )
    return rows[0] ? parseStringRecord(String(rows[0].values_json)) : {}
  }
  async write(templateId: string, values: Record<string, string>): Promise<void> {
    const checked = parseStringRecord(JSON.stringify(values))
    await this.pool.execute(
      `INSERT INTO prompt_values(template_id, values_json, updated_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE values_json=VALUES(values_json), updated_at=VALUES(updated_at)`,
      [templateId, JSON.stringify(checked), new Date().toISOString()]
    )
  }
}

class MySqlPrinterProfileRepository implements PrinterProfileRepository {
  constructor(private readonly pool: Pool) {}
  async read(printerId: string): Promise<PrintSettings | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT settings_json FROM printer_profiles WHERE printer_id=?',
      [printerId]
    )
    return rows[0]
      ? printSettingsSchema.parse(parseJson(String(rows[0].settings_json), 'printer profile'))
      : null
  }
  async write(printerId: string, settings: PrintSettings): Promise<void> {
    const checked = printSettingsSchema.parse(settings)
    await this.pool.execute(
      `INSERT INTO printer_profiles(printer_id, settings_json, updated_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json), updated_at=VALUES(updated_at)`,
      [printerId, JSON.stringify(checked), new Date().toISOString()]
    )
  }
}

interface TrackingRow extends RowDataPacket {
  data_source_id: string
  record_key: string
  status: PrintTrackingRecord['status']
  last_print_date: string
  job_id: string
  serial_used: string | null
  row_hash: string
  void_reason: string | null
}

const trackingRecord = (row: TrackingRow): PrintTrackingRecord => ({
  dataSourceId: row.data_source_id,
  recordKey: row.record_key,
  status: row.status,
  lastPrintDate: row.last_print_date,
  jobId: row.job_id,
  serialUsed: row.serial_used,
  rowHash: row.row_hash,
  voidReason: row.void_reason
})

class MySqlPrintTrackingRepository implements PrintTrackingRepository {
  constructor(private readonly pool: Pool) {}
  async read(dataSourceId: string, recordKey: string): Promise<PrintTrackingRecord | null> {
    const [rows] = await this.pool.execute<TrackingRow[]>(
      `SELECT data_source_id, record_key, status, last_print_date, job_id, serial_used,
              row_hash, void_reason
       FROM data_source_tracking WHERE data_source_id=? AND record_key=?`,
      [dataSourceId, recordKey]
    )
    return rows[0] ? parsePrintTrackingRecord(trackingRecord(rows[0])) : null
  }
  async list(dataSourceId: string): Promise<PrintTrackingRecord[]> {
    const [rows] = await this.pool.execute<TrackingRow[]>(
      `SELECT data_source_id, record_key, status, last_print_date, job_id, serial_used,
              row_hash, void_reason
       FROM data_source_tracking WHERE data_source_id=? ORDER BY record_key`,
      [dataSourceId]
    )
    return rows.map((row) => parsePrintTrackingRecord(trackingRecord(row)))
  }
  async write(record: PrintTrackingRecord): Promise<void> {
    const checked = parsePrintTrackingRecord(record)
    await this.pool.execute(
      `INSERT INTO data_source_tracking(
         data_source_id, record_key, status, last_print_date, job_id, serial_used,
         row_hash, void_reason, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status=VALUES(status), last_print_date=VALUES(last_print_date), job_id=VALUES(job_id),
         serial_used=VALUES(serial_used), row_hash=VALUES(row_hash),
         void_reason=VALUES(void_reason), updated_at=VALUES(updated_at)`,
      [
        checked.dataSourceId,
        checked.recordKey,
        checked.status,
        checked.lastPrintDate,
        checked.jobId,
        checked.serialUsed,
        checked.rowHash,
        checked.voidReason,
        new Date().toISOString()
      ]
    )
  }
}

class MySqlTemplateLibraryRepository implements TemplateLibraryRepository {
  constructor(private readonly pool: Pool) {}
  async list(): Promise<TemplateLibraryEntry[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id, path_value, title, description_text, tags_json, status, thumbnail_path,
              modified_at, indexed_at FROM template_library ORDER BY title, path_value`
    )
    return rows.map((value) => {
      const tags = parseJson(String(value.tags_json), 'template tags')
      if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))
        throw new Error('Stored template tags are corrupt.')
      return parseTemplateLibraryEntry({
        id: String(value.id),
        path: String(value.path_value),
        title: String(value.title),
        description: String(value.description_text),
        tags,
        status: value.status as TemplateLibraryEntry['status'],
        thumbnailPath: value.thumbnail_path === null ? null : String(value.thumbnail_path),
        modifiedAt: String(value.modified_at),
        indexedAt: String(value.indexed_at)
      })
    })
  }
  async upsert(entry: TemplateLibraryEntry): Promise<void> {
    const checked = parseTemplateLibraryEntry(entry)
    await this.pool.execute(
      `INSERT INTO template_library(
         id, path_value, title, description_text, tags_json, status, thumbnail_path,
         modified_at, indexed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         path_value=VALUES(path_value), title=VALUES(title),
         description_text=VALUES(description_text), tags_json=VALUES(tags_json),
         status=VALUES(status), thumbnail_path=VALUES(thumbnail_path),
         modified_at=VALUES(modified_at), indexed_at=VALUES(indexed_at)`,
      [
        checked.id,
        checked.path,
        checked.title,
        checked.description,
        JSON.stringify(checked.tags),
        checked.status,
        checked.thumbnailPath,
        checked.modifiedAt,
        checked.indexedAt
      ]
    )
  }
  async remove(id: string): Promise<void> {
    await this.pool.execute('DELETE FROM template_library WHERE id=?', [id])
  }
}

class MySqlDatabaseSettingRepository implements DatabaseSettingRepository {
  constructor(private readonly database: MySqlOrm) {}
  async read<T>(key: string): Promise<T | null> {
    const rows = await this.database
      .select({ valueJson: databaseSettings.valueJson })
      .from(databaseSettings)
      .where(eq(databaseSettings.settingKey, key))
      .limit(1)
    return rows[0] ? (parseJson(rows[0].valueJson, `database setting ${key}`) as T) : null
  }
  async write(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) throw new Error('Database setting must be JSON serializable.')
    const updatedAt = new Date().toISOString()
    await this.database
      .insert(databaseSettings)
      .values({ settingKey: key, valueJson: serialized, updatedAt })
      .onDuplicateKeyUpdate({ set: { valueJson: serialized, updatedAt } })
  }
  async remove(key: string): Promise<void> {
    await this.database.delete(databaseSettings).where(eq(databaseSettings.settingKey, key))
  }
}

export class MySqlDataRepositories implements DataRepositories {
  readonly serials: SerialRepository
  readonly printHistory: PrintHistoryRepository
  readonly promptValues: PromptValueRepository
  readonly printerProfiles: PrinterProfileRepository
  readonly printTracking: PrintTrackingRepository
  readonly templateLibrary: TemplateLibraryRepository
  readonly settings: DatabaseSettingRepository

  private constructor(
    private readonly pool: Pool,
    private readonly status: MigrationStatus,
    orm: MySqlOrm
  ) {
    this.serials = new MySqlSerialRepository(pool)
    this.printHistory = new MySqlPrintHistoryRepository(pool)
    this.promptValues = new MySqlPromptValueRepository(pool)
    this.printerProfiles = new MySqlPrinterProfileRepository(pool)
    this.printTracking = new MySqlPrintTrackingRepository(pool)
    this.templateLibrary = new MySqlTemplateLibraryRepository(pool)
    this.settings = new MySqlDatabaseSettingRepository(orm)
  }

  static async connect(
    config: MySqlConnectionConfig,
    engine: 'mysql' | 'mariadb' = 'mysql'
  ): Promise<MySqlDataRepositories> {
    const callbackPool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.tls ? {} : undefined,
      connectTimeout: config.connectTimeoutMs ?? 5000,
      connectionLimit: 5,
      maxIdle: 5,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    })
    const pool = callbackPool.promise()
    try {
      const status = await migrate(pool, engine, config.backupDirectory)
      return new MySqlDataRepositories(pool, status, drizzle({ client: callbackPool }))
    } catch (error) {
      await pool.end()
      throw error
    }
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
    const rowCounts: Record<string, number> = {}
    for (const table of tables) {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM \`${table}\``
      )
      rowCounts[table] = Number((rows[0] as { count: number }).count)
    }
    return { migration: await this.migrationStatus(), rowCounts, integrity: 'ok' }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

async function migrate(
  pool: Pool,
  engine: 'mysql' | 'mariadb',
  backupDirectory?: string
): Promise<MigrationStatus> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY, name VARCHAR(255) NOT NULL, applied_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB`)
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT version FROM schema_migrations ORDER BY version'
  )
  const applied = rows.map((row) => Number(row.version))
  const migrations = [
    {
      version: 1,
      name: 'initial-drizzle-schema',
      statements: await readGeneratedMigration('mysql')
    }
  ]
  const pending = migrations.filter((migration) => !applied.includes(migration.version))
  let backupPath: string | null = null
  if (pending.length) {
    const known = [
      'counters',
      'reservations',
      'print_history',
      'prompt_values',
      'printer_profiles',
      'data_source_tracking',
      'template_library',
      'database_settings',
      'schema_migrations'
    ]
    const [tableRows] = await pool.query<RowDataPacket[]>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema=DATABASE() AND table_name IN (${known.map(() => '?').join(',')})`,
      known
    )
    const tables: Record<string, unknown[]> = {}
    for (const row of tableRows) {
      const name = String(row.name)
      const [contents] = await pool.query<RowDataPacket[]>(`SELECT * FROM \`${name}\``)
      tables[name] = contents
    }
    backupPath = await writeMigrationBackup(backupDirectory, engine, tables)
  }
  for (const migration of pending) {
    for (const statement of migration.statements) {
      try {
        await pool.query(idempotentInitialMigration(statement, 'mysql'))
      } catch (error) {
        if ((error as { code?: string }).code !== 'ER_DUP_KEYNAME') throw error
      }
    }
    await pool.execute(
      'INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)',
      [migration.version, migration.name, new Date().toISOString()]
    )
  }
  const allApplied = [...applied, ...pending.map((migration) => migration.version)].sort(
    (a, b) => a - b
  )
  return {
    engine,
    currentVersion: allApplied.at(-1) ?? 0,
    latestVersion: migrations.at(-1)?.version ?? 0,
    applied: allApplied,
    pending: [],
    integrity: 'ok',
    backupPath
  }
}
