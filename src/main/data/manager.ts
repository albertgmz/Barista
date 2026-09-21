/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type {
  DataConfiguration,
  DataConfigurationInput,
  DataConnectionTestResult,
  DataRuntimeStatus
} from '@shared/dataSettings'
import { hostname } from 'node:os'
import { dirname } from 'node:path'
import { DataConfigurationStore, type ResolvedDataConfiguration } from './config'
import { importLegacyJsonData } from './legacyMigration'
import { MySqlDataRepositories } from './mysql'
import { SqliteDataRepositories } from './sqlite'
import { PostgreSqlDataRepositories } from './postgresql'
import type { DataRepositories, MySqlConnectionConfig, PostgreSqlConnectionConfig } from './types'
import { LATEST_DATA_SCHEMA_VERSION } from './types'
import { diagnosticLog } from '../diagnostics'

export interface DataStoreFactory {
  sqlite(path: string): DataRepositories
  mysql(config: MySqlConnectionConfig): Promise<DataRepositories>
  mariadb(config: MySqlConnectionConfig): Promise<DataRepositories>
  postgresql(config: PostgreSqlConnectionConfig): Promise<DataRepositories>
}

const defaultFactory: DataStoreFactory = {
  sqlite: (path) => new SqliteDataRepositories(path),
  mysql: (config) => MySqlDataRepositories.connect(config, 'mysql'),
  mariadb: (config) => MySqlDataRepositories.connect(config, 'mariadb'),
  postgresql: (config) => PostgreSqlDataRepositories.connect(config)
}

export class DataStoreManager {
  private current: DataRepositories | null = null
  private lastError: string | null = null
  private selectedEngine: 'sqlite' | 'mysql' | 'mariadb' | 'postgresql' = 'sqlite'

  constructor(
    private readonly configurationStore: DataConfigurationStore,
    private readonly sqlitePath: string,
    private readonly factory: DataStoreFactory = defaultFactory
  ) {}

  async initialize(): Promise<void> {
    try {
      const publicConfiguration = await this.configurationStore.readPublic()
      this.selectedEngine = publicConfiguration.engine
      const resolved = await this.configurationStore.readResolved()
      await this.activate(resolved)
      diagnosticLog.info('database.initialized', {
        engine: this.selectedEngine,
        migration: await this.current?.migrationStatus()
      })
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      diagnosticLog.error('database.initialization-failed', {
        engine: this.selectedEngine,
        error
      })
    }
  }

  repositories(): DataRepositories {
    if (!this.current) throw new Error(this.lastError ?? 'The selected data store is unavailable.')
    return this.current
  }

  async configuration(): Promise<DataConfiguration> {
    return this.configurationStore.readPublic()
  }

  async testConnection(input: DataConfigurationInput): Promise<DataConnectionTestResult> {
    diagnosticLog.info('database.connection-test', { engine: input.engine })
    const resolved = await this.configurationStore.resolveInput(input)
    const candidate = await this.connect(resolved)
    try {
      const status = await candidate.migrationStatus()
      return {
        message:
          resolved.engine === 'sqlite'
            ? 'Local SQLite database is ready.'
            : `Connected to ${resolved.engine === 'postgresql' ? 'PostgreSQL' : resolved.engine === 'mariadb' ? 'MariaDB' : 'MySQL'} at ${resolved.host}:${resolved.port}.`,
        status
      }
    } finally {
      await candidate.close()
    }
  }

  async saveConfiguration(input: DataConfigurationInput): Promise<DataConfiguration> {
    const saved = await this.configurationStore.write(input)
    const resolved = await this.configurationStore.readResolved()
    await this.activate(resolved)
    diagnosticLog.info('database.configuration-saved', { engine: saved.engine })
    return saved
  }

  async runtimeStatus(): Promise<DataRuntimeStatus> {
    if (this.current) {
      return {
        connection: 'connected',
        error: null,
        migration: await this.current.migrationStatus()
      }
    }
    return {
      connection: 'unavailable',
      error: this.lastError ?? 'The selected data store is unavailable.',
      migration: {
        engine: this.selectedEngine,
        currentVersion: 0,
        latestVersion: LATEST_DATA_SCHEMA_VERSION,
        applied: [],
        pending: [LATEST_DATA_SCHEMA_VERSION],
        integrity: 'unavailable',
        backupPath: null
      }
    }
  }

  async close(): Promise<void> {
    const current = this.current
    this.current = null
    if (current) await current.close()
  }

  private async activate(config: ResolvedDataConfiguration): Promise<void> {
    this.selectedEngine = config.engine
    const previous = this.current
    this.current = null
    if (previous) await previous.close()
    try {
      const candidate = await this.connect(config)
      try {
        await importLegacyJsonData(candidate, dirname(this.sqlitePath), hostname())
      } catch (error) {
        await candidate.close()
        throw error
      }
      this.current = candidate
      this.lastError = null
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  private connect(config: ResolvedDataConfiguration): Promise<DataRepositories> {
    if (config.engine === 'sqlite') return Promise.resolve(this.factory.sqlite(this.sqlitePath))
    const settings = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      tls: config.tls,
      backupDirectory: dirname(this.sqlitePath)
    }
    return this.factory[config.engine](settings)
  }
}
