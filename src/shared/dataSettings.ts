/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { z } from 'zod'

export const serverPublicSettingsSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().trim().min(1).max(128),
  user: z.string().trim().min(1).max(128),
  tls: z.boolean(),
  passwordSaved: z.boolean()
})

export const dataConfigurationSchema = z.object({
  engine: z.enum(['sqlite', 'mysql', 'mariadb', 'postgresql']),
  mysql: serverPublicSettingsSchema,
  mariadb: serverPublicSettingsSchema,
  postgresql: serverPublicSettingsSchema
})

export const dataConfigurationInputSchema = z.object({
  engine: z.enum(['sqlite', 'mysql', 'mariadb', 'postgresql']),
  mysql: serverPublicSettingsSchema
    .omit({ passwordSaved: true })
    .extend({ password: z.string().max(1024).optional() }),
  mariadb: serverPublicSettingsSchema
    .omit({ passwordSaved: true })
    .extend({ password: z.string().max(1024).optional() }),
  postgresql: serverPublicSettingsSchema
    .omit({ passwordSaved: true })
    .extend({ password: z.string().max(1024).optional() })
})

export type DataConfiguration = z.infer<typeof dataConfigurationSchema>
export type DataConfigurationInput = z.infer<typeof dataConfigurationInputSchema>

export interface DataMigrationStatus {
  engine: 'sqlite' | 'mysql' | 'mariadb' | 'postgresql'
  currentVersion: number
  latestVersion: number
  applied: number[]
  pending: number[]
  integrity: 'ok' | 'unavailable'
  backupPath: string | null
}

export interface DataConnectionTestResult {
  message: string
  status: DataMigrationStatus
}

export interface DataRuntimeStatus {
  connection: 'connected' | 'unavailable'
  error: string | null
  migration: DataMigrationStatus
}

export interface DataConfigurationSaveResult {
  configuration: DataConfiguration
  status: DataRuntimeStatus
}

export const DEFAULT_DATA_CONFIGURATION: DataConfiguration = {
  engine: 'sqlite',
  mysql: {
    host: 'localhost',
    port: 3306,
    database: 'barista',
    user: 'barista',
    tls: true,
    passwordSaved: false
  },
  mariadb: {
    host: 'localhost',
    port: 3306,
    database: 'barista',
    user: 'barista',
    tls: true,
    passwordSaved: false
  },
  postgresql: {
    host: 'localhost',
    port: 5432,
    database: 'barista',
    user: 'barista',
    tls: true,
    passwordSaved: false
  }
}
