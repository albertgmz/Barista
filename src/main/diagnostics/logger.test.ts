/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RollingJsonLogger } from './logger'

const paths: string[] = []
afterEach(async () => Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true }))))

describe('rolling JSONL logger', () => {
  it('redacts before writing and filters below the selected verbosity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'barista-log-'))
    paths.push(directory)
    const logger = new RollingJsonLogger({ directory, level: 'info', username: 'albert' })
    await logger.initialize()
    logger.debug('hidden', { password: 'debug-secret' })
    logger.info('written', {
      password: 'coffee-secret',
      apiToken: 'abcdefgh1234',
      path: 'C:\\Users\\albert\\secret.xlsx'
    })
    await logger.flush()
    const text = await readFile(join(directory, 'barista.jsonl'), 'utf8')
    expect(text).not.toContain('debug-secret')
    expect(text).not.toContain('coffee-secret')
    expect(text).not.toContain('abcdefgh1234')
    expect(text).not.toContain('C:\\Users\\albert')
    expect(text).toContain('…1234')
    expect(text).toContain('%USER%')
  })

  it('rotates by size and deletes expired rotations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'barista-log-'))
    paths.push(directory)
    const now = new Date('2026-09-20T12:00:00.000Z')
    await writeFile(join(directory, 'barista-old.jsonl'), '{}\n')
    await utimes(join(directory, 'barista-old.jsonl'), new Date(0), new Date(0))
    const logger = new RollingJsonLogger({
      directory,
      maxBytes: 140,
      keepMs: 1_000,
      now: () => now
    })
    await logger.initialize()
    logger.info('first', { note: 'x'.repeat(80) })
    logger.info('second', { note: 'y'.repeat(80) })
    await logger.flush()
    const files = await readdir(directory)
    expect(files).not.toContain('barista-old.jsonl')
    expect(files).toContain('barista.jsonl')
    expect(files.some((file) => /^barista-.*\.jsonl$/.test(file))).toBe(true)
  })
})
