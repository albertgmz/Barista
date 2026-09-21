/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { SettingsStoreFile } from '@main/storage/settings'
import { fromService, handle } from './typedIpc'
import { diagnosticLog, setDiagnosticLevel } from '@main/diagnostics'

const store = new SettingsStoreFile()

export function registerSettingsIpc(): void {
  handle('settings:read', () =>
    fromService('Reading settings', async () => {
      const settings = await store.read()
      diagnosticLog.info('preferences.loaded', settings)
      return settings
    })
  )

  handle('settings:write', (patch) =>
    fromService('Writing settings', async () => {
      const settings = await store.write(patch)
      setDiagnosticLevel(settings.diagnostics.level)
      diagnosticLog.info('preferences.saved', settings)
      return settings
    })
  )
}
