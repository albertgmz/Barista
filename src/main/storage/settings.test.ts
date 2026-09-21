/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_APP_SETTINGS } from '@shared/settings'
import { SettingsStoreFile } from './settings'

const roots: string[] = []
async function setup(): Promise<{ root: string; store: SettingsStoreFile }> {
  const root = await mkdtemp(join(tmpdir(), 'barista-settings-test-'))
  roots.push(root)
  return { root, store: new SettingsStoreFile(join(root, 'settings.json')) }
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))))

describe('SettingsStoreFile', () => {
  it('returns defaults when settings are absent or corrupt', async () => {
    const { root, store } = await setup()
    expect(await store.read()).toEqual(DEFAULT_APP_SETTINGS)
    await writeFile(join(root, 'settings.json'), '{broken')
    expect(await store.read()).toEqual(DEFAULT_APP_SETTINGS)
  })

  it('validates, merges and atomically persists settings', async () => {
    const { root, store } = await setup()
    const settings = await store.write({ units: 'in', gridSizeMm: 2.5, screenDpi: 110 })
    expect(settings.units).toBe('in')
    expect(settings.defaultLabel).toEqual(DEFAULT_APP_SETTINGS.defaultLabel)
    expect(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))).toEqual(settings)
    await expect(store.write({ gridSizeMm: -1 })).rejects.toThrow('settings')
  })
})
