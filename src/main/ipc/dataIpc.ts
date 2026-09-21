/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { dataStoreManager } from '@main/data'
import { fromService, handle } from './typedIpc'

export function registerDataIpc(): void {
  handle('data:configuration', () =>
    fromService('Reading data configuration', () => dataStoreManager().configuration())
  )
  handle('data:saveConfiguration', (request) =>
    fromService('Saving data configuration', async () => {
      const manager = dataStoreManager()
      const configuration = await manager.saveConfiguration(request)
      return { configuration, status: await manager.runtimeStatus() }
    })
  )
  handle('data:testConnection', (request) =>
    fromService('Testing data connection', () => dataStoreManager().testConnection(request))
  )
  handle('data:status', () =>
    fromService('Reading data status', () => dataStoreManager().runtimeStatus())
  )
}
