/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { writeMigrationBackup } from './migrationBackup'

const roots: string[] = []
const gunzipAsync = promisify(gunzip)

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

it('writes a compressed logical backup before a server migration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'barista-migration-backup-'))
  roots.push(root)
  const path = await writeMigrationBackup(root, 'postgresql', {
    counters: [{ counter_id: 'shared:serial', next_value: 42 }]
  })
  expect(path).not.toBeNull()
  const backup = JSON.parse(String(await gunzipAsync(await readFile(path!))))
  expect(backup).toMatchObject({
    engine: 'postgresql',
    tables: { counters: [{ counter_id: 'shared:serial', next_value: 42 }] }
  })
})
