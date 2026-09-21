/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)

export async function writeMigrationBackup(
  directory: string | undefined,
  engine: 'mysql' | 'mariadb' | 'postgresql',
  tables: Record<string, unknown[]>
): Promise<string | null> {
  if (!directory) return null
  await mkdir(directory, { recursive: true })
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const path = join(directory, `${engine}-before-migration-${timestamp}.json.gz`)
  const payload = JSON.stringify({ engine, createdAt: new Date().toISOString(), tables })
  await writeFile(path, await gzipAsync(Buffer.from(payload)))
  return path
}
