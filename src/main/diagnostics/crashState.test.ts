/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPendingCrash,
  dismissCrashNotice,
  markPendingCrashSync,
  readCrashNotice,
  readPendingCrash,
  saveCrashNotice
} from './crashState'
import { isCrashReason, rendererGoneContext } from './crash'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))))

describe('crash report state', () => {
  it('does not treat a normal renderer exit as a crash', () => {
    expect(isCrashReason('clean-exit')).toBe(false)
    expect(isCrashReason('crashed')).toBe(true)
    expect(isCrashReason('oom')).toBe(true)
  })
  it('records the exit code alongside the reason, and nothing else', () => {
    const details = { reason: 'crashed', exitCode: -1073741819, serviceName: 'renderer' }
    expect(rendererGoneContext(details)).toEqual({ reason: 'crashed', exitCode: -1073741819 })
    expect(Object.keys(rendererGoneContext(details))).toEqual(['reason', 'exitCode'])
  })
  it('records a redacted crash, promotes one notice, and dismisses only the matching crash', async () => {
    const root = await mkdtemp(join(tmpdir(), 'barista-crash-'))
    roots.push(root)
    const pending = markPendingCrashSync(root, 'renderer.gone', { password: 'secret' })
    expect(JSON.stringify(await readPendingCrash(root))).not.toContain('secret')
    await saveCrashNotice(root, {
      id: pending.id,
      path: join(root, 'report.zip'),
      createdAt: pending.createdAt
    })
    await clearPendingCrash(root)
    expect(await readPendingCrash(root)).toBeNull()
    await dismissCrashNotice(root, 'another-crash')
    expect((await readCrashNotice(root))?.id).toBe(pending.id)
    await dismissCrashNotice(root, pending.id)
    expect(await readCrashNotice(root)).toBeNull()
  })
})
