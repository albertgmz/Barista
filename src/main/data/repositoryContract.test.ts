/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { CounterVariable } from '@shared/template/types'
import { runRepositoryContract } from './contractSuite'
import { SqliteDataRepositories } from './sqlite'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

runRepositoryContract('SQLite', () => {
  const root = mkdtempSync(join(tmpdir(), 'barista-data-'))
  roots.push(root)
  return new SqliteDataRepositories(join(root, 'barista.db'))
})

const variable: CounterVariable = {
  id: 'legacy',
  name: 'serial',
  kind: 'counter',
  start: 1,
  step: 1,
  padding: 1,
  padChar: '0',
  prefix: '',
  suffix: '',
  scope: 'global',
  sharedName: 'legacy',
  format: 'numeric',
  alphabet: '0123456789',
  min: 0,
  max: 9999,
  overflow: 'stop',
  reset: 'never',
  failure: 'void'
}

describe('SQLite migration safety', () => {
  it('reserves without duplicates through multiple database connections', async () => {
    const root = mkdtempSync(join(tmpdir(), 'barista-concurrent-db-'))
    roots.push(root)
    const path = join(root, 'barista.db')
    const stores = Array.from({ length: 6 }, () => new SqliteDataRepositories(path))
    const reservations = await Promise.all(
      stores.flatMap((store) =>
        Array.from({ length: 10 }, () => store.serials.reserve(variable, 10))
      )
    )
    expect(new Set(reservations.flatMap((reservation) => reservation.values)).size).toBe(600)
    await Promise.all(stores.map((store) => store.close()))
  })

  it('backs up and preserves the 0.2 counter ledger before migration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'barista-legacy-db-'))
    roots.push(root)
    const path = join(root, 'counters.db')
    const legacy = new DatabaseSync(path)
    legacy.exec(
      `CREATE TABLE counters (
         counter_id TEXT PRIMARY KEY, next_value INTEGER NOT NULL, reset_key TEXT NOT NULL
       );
       CREATE TABLE reservations (
         id TEXT PRIMARY KEY, counter_id TEXT NOT NULL, first_value INTEGER NOT NULL,
         count INTEGER NOT NULL, step INTEGER NOT NULL, next_value INTEGER NOT NULL,
         status TEXT NOT NULL, created_at TEXT NOT NULL
       );
       INSERT INTO counters(counter_id, next_value, reset_key)
       VALUES ('shared:legacy', 42, 'never');`
    )
    legacy.close()

    const store = new SqliteDataRepositories(path)
    const status = await store.migrationStatus()
    expect(status.backupPath).not.toBeNull()
    expect(existsSync(status.backupPath!)).toBe(true)
    await expect(store.serials.peek(variable)).resolves.toBe(42)
    await store.close()
  })

  it('refuses to migrate a corrupt SQLite file', () => {
    const root = mkdtempSync(join(tmpdir(), 'barista-corrupt-db-'))
    roots.push(root)
    const path = join(root, 'counters.db')
    writeFileSync(path, 'not a sqlite database')
    expect(() => new SqliteDataRepositories(path)).toThrow()
  })
})
