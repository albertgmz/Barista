/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/** Persistence for the application settings. */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppSettings } from '@shared/settings'
import { appSettingsSchema, DEFAULT_APP_SETTINGS, mergeSettings } from '@shared/settings'
import { stableJson } from '@shared/format/stableJson'
import { userDataPaths } from './paths'

export interface SettingsStore {
  read(): Promise<AppSettings>
  /** Merges a patch over the stored settings and returns the new state. */
  write(patch: Partial<AppSettings>): Promise<AppSettings>
}

export class SettingsStoreFile implements SettingsStore {
  constructor(private readonly path = userDataPaths().settingsFile) {}
  async read(): Promise<AppSettings> {
    try {
      const result = appSettingsSchema.safeParse(JSON.parse(await readFile(this.path, 'utf8')))
      return result.success ? result.data : structuredClone(DEFAULT_APP_SETTINGS)
    } catch {
      return structuredClone(DEFAULT_APP_SETTINGS)
    }
  }

  async write(patch: Partial<AppSettings>): Promise<AppSettings> {
    let settings: AppSettings
    try {
      settings = mergeSettings(await this.read(), patch)
    } catch (error) {
      throw new Error('Invalid application settings.', { cause: error })
    }
    await mkdir(dirname(this.path), { recursive: true })
    const temp = `${this.path}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temp, stableJson(settings), 'utf8')
      await rename(temp, this.path)
    } catch (error) {
      try {
        await unlink(temp)
      } catch {
        // Rename may already have consumed the temporary file.
      }
      throw error
    }
    return settings
  }
}
