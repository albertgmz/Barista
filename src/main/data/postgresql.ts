/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, type PoolClient } from 'pg'
import type { PrintHistoryEntry } from '@shared/ipc/contract'
import { printSettingsSchema, type PrintSettings } from '@shared/printSettings'
import type { CounterVariable } from '@shared/template/types'
import { counterResetKey, counterValue } from '@shared/variables'
import { idempotentInitialMigration, readGeneratedMigration } from './drizzleMigrations'
import { databaseSettings } from './schema/postgresql'
import type {
  DataRepositories,
  DatabaseSettingRepository,
  MigrationStatus,
  PostgreSqlConnectionConfig,
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
import {
  parsePrintHistoryEntry,
  parsePrintTrackingRecord,
  parseTemplateLibraryEntry
} from './validation'
import { writeMigrationBackup } from './migrationBackup'

const parseJson = (value: string, label: string): unknown => {
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
const keyFor = (variable: CounterVariable): string =>
  variable.scope === 'global' && variable.sharedName
    ? `shared:${variable.sharedName}`
    : `template:${variable.id}`
async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK')
  } catch {
    /* Preserve the original error. */
  }
}

class PostgreSqlSerialRepository implements SerialRepository {
  constructor(private readonly pool: Pool) {}
  async peek(variable: CounterVariable, date = new Date()): Promise<number> {
    const row = (
      await this.pool.query<{ next_value: string; reset_key: string }>(
        'SELECT next_value, reset_key FROM counters WHERE counter_id=$1',
        [keyFor(variable)]
      )
    ).rows[0]
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
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const counterId = keyFor(variable),
        period = counterResetKey(variable.reset, date)
      await client.query(
        'INSERT INTO counters(counter_id,next_value,reset_key) VALUES($1,$2,$3) ON CONFLICT(counter_id) DO NOTHING',
        [counterId, variable.start, period]
      )
      const row = (
        await client.query<{ next_value: string; reset_key: string }>(
          'SELECT next_value,reset_key FROM counters WHERE counter_id=$1 FOR UPDATE',
          [counterId]
        )
      ).rows[0]!
      const first = row.reset_key === period ? Number(row.next_value) : variable.start
      const values = Array.from({ length: count }, (_, index) =>
        counterValue(variable, index, first)
      )
      const next =
        variable.overflow === 'wrap'
          ? counterValue(variable, count, first)
          : first + variable.step * count
      await client.query('UPDATE counters SET next_value=$1,reset_key=$2 WHERE counter_id=$3', [
        next,
        period,
        counterId
      ])
      const id = randomUUID()
      await client.query(
        "INSERT INTO reservations(id,counter_id,first_value,count_value,step_value,next_value,status,created_at) VALUES($1,$2,$3,$4,$5,$6,'reserved',$7)",
        [id, counterId, first, count, variable.step, next, new Date().toISOString()]
      )
      await client.query('COMMIT')
      return { id, counterId, values, status: 'reserved' }
    } catch (error) {
      await rollback(client)
      throw error
    } finally {
      client.release()
    }
  }
  async commit(reservationId: string): Promise<void> {
    const result = await this.pool.query(
      "UPDATE reservations SET status='committed' WHERE id=$1 AND status='reserved'",
      [reservationId]
    )
    if (result.rowCount !== 1) throw new Error('Serial reservation is not available to commit.')
  }
  async fail(reservationId: string, policy: CounterVariable['failure']): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const reservation = (
        await client.query<{
          counter_id: string
          first_value: string
          next_value: string
          status: SerialReservation['status']
        }>(
          'SELECT counter_id,first_value,next_value,status FROM reservations WHERE id=$1 FOR UPDATE',
          [reservationId]
        )
      ).rows[0]
      if (!reservation || reservation.status !== 'reserved')
        throw new Error('Serial reservation is not available to fail.')
      let status: SerialReservation['status'] = 'void'
      if (policy === 'release') {
        const current = (
          await client.query<{ next_value: string }>(
            'SELECT next_value FROM counters WHERE counter_id=$1 FOR UPDATE',
            [reservation.counter_id]
          )
        ).rows[0]
        if (current && Number(current.next_value) === Number(reservation.next_value)) {
          await client.query('UPDATE counters SET next_value=$1 WHERE counter_id=$2', [
            reservation.first_value,
            reservation.counter_id
          ])
          status = 'released'
        }
      }
      await client.query('UPDATE reservations SET status=$1 WHERE id=$2', [status, reservationId])
      await client.query('COMMIT')
    } catch (error) {
      await rollback(client)
      throw error
    } finally {
      client.release()
    }
  }
  async reset(counterId: string, value: number): Promise<void> {
    await this.pool.query(
      "INSERT INTO counters(counter_id,next_value,reset_key) VALUES($1,$2,'never') ON CONFLICT(counter_id) DO UPDATE SET next_value=EXCLUDED.next_value,reset_key=EXCLUDED.reset_key",
      [counterId, value]
    )
  }
}

class PostgreSqlPrintHistoryRepository implements PrintHistoryRepository {
  constructor(private readonly pool: Pool) {}
  async append(entry: PrintHistoryEntry): Promise<void> {
    const e = parsePrintHistoryEntry(entry)
    await this.pool.query(
      'INSERT INTO print_history(id,date_value,user_name,computer,template_name,printer,serial_range,serialized_labels,copies,result,error_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING',
      [
        e.id,
        e.date,
        e.user,
        e.computer,
        e.template,
        e.printer,
        e.serialRange,
        e.serializedLabels,
        e.copies,
        e.result,
        e.error ?? null
      ]
    )
  }
  async list(limit = 5000): Promise<PrintHistoryEntry[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000)
      throw new Error('History limit must be between 1 and 5,000.')
    const rows = (
      await this.pool.query(
        'SELECT id,date_value,user_name,computer,template_name,printer,serial_range,serialized_labels,copies,result,error_text FROM print_history ORDER BY date_value DESC,id DESC LIMIT $1',
        [limit]
      )
    ).rows
    return rows.map((r) =>
      parsePrintHistoryEntry({
        id: r.id,
        date: r.date_value,
        user: r.user_name,
        computer: r.computer,
        template: r.template_name,
        printer: r.printer,
        serialRange: r.serial_range,
        serializedLabels: r.serialized_labels,
        copies: r.copies,
        result: r.result,
        ...(r.error_text ? { error: r.error_text } : {})
      })
    )
  }
}
class PostgreSqlPromptValueRepository implements PromptValueRepository {
  constructor(private readonly pool: Pool) {}
  async read(templateId: string): Promise<Record<string, string>> {
    const row = (
      await this.pool.query<{ values_json: string }>(
        'SELECT values_json FROM prompt_values WHERE template_id=$1',
        [templateId]
      )
    ).rows[0]
    return row ? parseStringRecord(row.values_json) : {}
  }
  async write(templateId: string, values: Record<string, string>): Promise<void> {
    const value = JSON.stringify(parseStringRecord(JSON.stringify(values)))
    await this.pool.query(
      'INSERT INTO prompt_values(template_id,values_json,updated_at) VALUES($1,$2,$3) ON CONFLICT(template_id) DO UPDATE SET values_json=EXCLUDED.values_json,updated_at=EXCLUDED.updated_at',
      [templateId, value, new Date().toISOString()]
    )
  }
}
class PostgreSqlPrinterProfileRepository implements PrinterProfileRepository {
  constructor(private readonly pool: Pool) {}
  async read(printerId: string): Promise<PrintSettings | null> {
    const row = (
      await this.pool.query<{ settings_json: string }>(
        'SELECT settings_json FROM printer_profiles WHERE printer_id=$1',
        [printerId]
      )
    ).rows[0]
    return row ? printSettingsSchema.parse(parseJson(row.settings_json, 'printer profile')) : null
  }
  async write(printerId: string, settings: PrintSettings): Promise<void> {
    const value = JSON.stringify(printSettingsSchema.parse(settings))
    await this.pool.query(
      'INSERT INTO printer_profiles(printer_id,settings_json,updated_at) VALUES($1,$2,$3) ON CONFLICT(printer_id) DO UPDATE SET settings_json=EXCLUDED.settings_json,updated_at=EXCLUDED.updated_at',
      [printerId, value, new Date().toISOString()]
    )
  }
}
const tracking = (r: Record<string, unknown>): PrintTrackingRecord =>
  parsePrintTrackingRecord({
    dataSourceId: String(r['data_source_id']),
    recordKey: String(r['record_key']),
    status: r['status'],
    lastPrintDate: String(r['last_print_date']),
    jobId: String(r['job_id']),
    serialUsed: r['serial_used'] === null ? null : String(r['serial_used']),
    rowHash: String(r['row_hash']),
    voidReason: r['void_reason'] === null ? null : String(r['void_reason'])
  })
class PostgreSqlPrintTrackingRepository implements PrintTrackingRepository {
  constructor(private readonly pool: Pool) {}
  async read(dataSourceId: string, recordKey: string): Promise<PrintTrackingRecord | null> {
    const row = (
      await this.pool.query(
        'SELECT data_source_id,record_key,status,last_print_date,job_id,serial_used,row_hash,void_reason FROM data_source_tracking WHERE data_source_id=$1 AND record_key=$2',
        [dataSourceId, recordKey]
      )
    ).rows[0]
    return row ? tracking(row) : null
  }
  async list(dataSourceId: string): Promise<PrintTrackingRecord[]> {
    return (
      await this.pool.query(
        'SELECT data_source_id,record_key,status,last_print_date,job_id,serial_used,row_hash,void_reason FROM data_source_tracking WHERE data_source_id=$1 ORDER BY record_key',
        [dataSourceId]
      )
    ).rows.map(tracking)
  }
  async write(record: PrintTrackingRecord): Promise<void> {
    const r = parsePrintTrackingRecord(record)
    await this.pool.query(
      'INSERT INTO data_source_tracking(data_source_id,record_key,status,last_print_date,job_id,serial_used,row_hash,void_reason,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(data_source_id,record_key) DO UPDATE SET status=EXCLUDED.status,last_print_date=EXCLUDED.last_print_date,job_id=EXCLUDED.job_id,serial_used=EXCLUDED.serial_used,row_hash=EXCLUDED.row_hash,void_reason=EXCLUDED.void_reason,updated_at=EXCLUDED.updated_at',
      [
        r.dataSourceId,
        r.recordKey,
        r.status,
        r.lastPrintDate,
        r.jobId,
        r.serialUsed,
        r.rowHash,
        r.voidReason,
        new Date().toISOString()
      ]
    )
  }
}
class PostgreSqlTemplateLibraryRepository implements TemplateLibraryRepository {
  constructor(private readonly pool: Pool) {}
  async list(): Promise<TemplateLibraryEntry[]> {
    return (
      await this.pool.query(
        'SELECT id,path_value,title,description_text,tags_json,status,thumbnail_path,modified_at,indexed_at FROM template_library ORDER BY title,path_value'
      )
    ).rows.map((r) =>
      parseTemplateLibraryEntry({
        id: r.id,
        path: r.path_value,
        title: r.title,
        description: r.description_text,
        tags: parseJson(r.tags_json, 'template tags'),
        status: r.status,
        thumbnailPath: r.thumbnail_path,
        modifiedAt: r.modified_at,
        indexedAt: r.indexed_at
      })
    )
  }
  async upsert(entry: TemplateLibraryEntry): Promise<void> {
    const e = parseTemplateLibraryEntry(entry)
    await this.pool.query(
      'INSERT INTO template_library(id,path_value,title,description_text,tags_json,status,thumbnail_path,modified_at,indexed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET path_value=EXCLUDED.path_value,title=EXCLUDED.title,description_text=EXCLUDED.description_text,tags_json=EXCLUDED.tags_json,status=EXCLUDED.status,thumbnail_path=EXCLUDED.thumbnail_path,modified_at=EXCLUDED.modified_at,indexed_at=EXCLUDED.indexed_at',
      [
        e.id,
        e.path,
        e.title,
        e.description,
        JSON.stringify(e.tags),
        e.status,
        e.thumbnailPath,
        e.modifiedAt,
        e.indexedAt
      ]
    )
  }
  async remove(id: string): Promise<void> {
    await this.pool.query('DELETE FROM template_library WHERE id=$1', [id])
  }
}
type PostgreSqlOrm = ReturnType<typeof drizzle>
class PostgreSqlDatabaseSettingRepository implements DatabaseSettingRepository {
  constructor(private readonly database: PostgreSqlOrm) {}
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
      .onConflictDoUpdate({
        target: databaseSettings.settingKey,
        set: { valueJson: serialized, updatedAt }
      })
  }
  async remove(key: string): Promise<void> {
    await this.database.delete(databaseSettings).where(eq(databaseSettings.settingKey, key))
  }
}

export class PostgreSqlDataRepositories implements DataRepositories {
  readonly serials: SerialRepository
  readonly printHistory: PrintHistoryRepository
  readonly promptValues: PromptValueRepository
  readonly printerProfiles: PrinterProfileRepository
  readonly printTracking: PrintTrackingRepository
  readonly templateLibrary: TemplateLibraryRepository
  readonly settings: DatabaseSettingRepository
  private constructor(
    private readonly pool: Pool,
    private readonly status: MigrationStatus
  ) {
    const orm = drizzle({ client: pool })
    this.serials = new PostgreSqlSerialRepository(pool)
    this.printHistory = new PostgreSqlPrintHistoryRepository(pool)
    this.promptValues = new PostgreSqlPromptValueRepository(pool)
    this.printerProfiles = new PostgreSqlPrinterProfileRepository(pool)
    this.printTracking = new PostgreSqlPrintTrackingRepository(pool)
    this.templateLibrary = new PostgreSqlTemplateLibraryRepository(pool)
    this.settings = new PostgreSqlDatabaseSettingRepository(orm)
  }
  static async connect(config: PostgreSqlConnectionConfig): Promise<PostgreSqlDataRepositories> {
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.tls ? { rejectUnauthorized: true } : undefined,
      connectionTimeoutMillis: config.connectTimeoutMs ?? 5000,
      max: 5
    })
    try {
      return new PostgreSqlDataRepositories(pool, await migrate(pool, config.backupDirectory))
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
      const result = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM "${table}"`
      )
      rowCounts[table] = Number(result.rows[0]!.count)
    }
    return { migration: await this.migrationStatus(), rowCounts, integrity: 'ok' }
  }
  async close(): Promise<void> {
    await this.pool.end()
  }
}

async function migrate(pool: Pool, backupDirectory?: string): Promise<MigrationStatus> {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,name varchar(255) NOT NULL,applied_at varchar(32) NOT NULL)'
  )
  const applied = (
    await pool.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')
  ).rows.map((r) => r.version)
  let backupPath: string | null = null
  if (!applied.includes(1)) {
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
    const tableRows = await pool.query<{ table_name: string }>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name = ANY($1)',
      [known]
    )
    const tables: Record<string, unknown[]> = {}
    for (const { table_name: name } of tableRows.rows)
      tables[name] = (await pool.query(`SELECT * FROM "${name}"`)).rows
    backupPath = await writeMigrationBackup(backupDirectory, 'postgresql', tables)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const statement of await readGeneratedMigration('postgresql')) {
        if (!statement.startsWith('CREATE TABLE "schema_migrations"'))
          await client.query(idempotentInitialMigration(statement))
      }
      await client.query(
        'INSERT INTO schema_migrations(version,name,applied_at) VALUES($1,$2,$3)',
        [1, 'initial-drizzle-schema', new Date().toISOString()]
      )
      await client.query('COMMIT')
    } catch (error) {
      await rollback(client)
      throw error
    } finally {
      client.release()
    }
  }
  return {
    engine: 'postgresql',
    currentVersion: 1,
    latestVersion: 1,
    applied: [1],
    pending: [],
    integrity: 'ok',
    backupPath
  }
}
