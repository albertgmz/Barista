/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type DataDialect = 'sqlite' | 'mysql' | 'postgresql'

function migrationPath(dialect: DataDialect): string {
  const relative = join('drizzle', dialect, '0000_initial', 'migration.sql')
  const packaged = join(process.resourcesPath ?? '', relative)
  return existsSync(packaged) ? packaged : join(process.cwd(), relative)
}

export function readGeneratedMigrationSync(dialect: DataDialect): string[] {
  return splitMigration(readFileSync(migrationPath(dialect), 'utf8'))
}

export async function readGeneratedMigration(dialect: DataDialect): Promise<string[]> {
  return splitMigration(await readFile(migrationPath(dialect), 'utf8'))
}

function splitMigration(contents: string): string[] {
  return contents
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

/** Initial migrations must also upgrade pre-Drizzle databases whose tables already exist. */
export function idempotentInitialMigration(
  statement: string,
  dialect: DataDialect = 'sqlite'
): string {
  const table = statement.replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ')
  return dialect === 'mysql'
    ? table
    : table
        .replace(/^CREATE UNIQUE INDEX /i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
        .replace(/^CREATE INDEX /i, 'CREATE INDEX IF NOT EXISTS ')
}
