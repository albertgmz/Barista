/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PRINT_SETTINGS } from '@shared/printSettings'
import { importLegacyJsonData } from './legacyMigration'
import { SqliteDataRepositories } from './sqlite'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('legacy JSON data migration', () => {
  it('imports valid records once and leaves source files untouched', async () => {
    const root = await mkdtemp(join(tmpdir(), 'barista-legacy-'))
    roots.push(root)
    await writeFile(
      join(root, 'print-history.json'),
      JSON.stringify([
        {
          id: 'job-1',
          date: '2026-09-20T12:00:00.000Z',
          user: 'operator',
          computer: 'station',
          template: 'Label',
          printer: 'printer',
          serialRange: '',
          serializedLabels: 1,
          copies: 1,
          result: 'done'
        }
      ])
    )
    await writeFile(
      join(root, 'prompt-values.json'),
      JSON.stringify({ label: { equipment: 'E1' } })
    )
    await writeFile(
      join(root, 'printers.json'),
      JSON.stringify({ printer: DEFAULT_PRINT_SETTINGS })
    )
    const store = new SqliteDataRepositories(join(root, 'data.db'))
    await importLegacyJsonData(store, root, 'station-a')
    await importLegacyJsonData(store, root, 'station-a')
    await expect(store.printHistory.list()).resolves.toHaveLength(1)
    await expect(store.promptValues.read('label')).resolves.toEqual({ equipment: 'E1' })
    await expect(store.printerProfiles.read('printer')).resolves.toEqual(DEFAULT_PRINT_SETTINGS)
    await expect(
      import('node:fs/promises').then(({ stat }) => stat(join(root, 'print-history.json')))
    ).resolves.toBeDefined()
    await store.close()
  })
})
