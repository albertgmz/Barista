/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app } from 'electron'
import { fromService, handle } from './typedIpc'
import { integrationServer } from '@main/server/printApi'
import {
  createIntegrationToken,
  integrationAudit,
  listIntegrationTokens,
  readIntegrationConfiguration,
  revokeIntegrationToken,
  writeIntegrationConfiguration
} from '@main/server/config'
import { syncIntegrationTray } from '@main/server/lifecycle'

async function status() {
  return {
    configuration: await readIntegrationConfiguration(),
    running: integrationServer.isRunning,
    actualPort: integrationServer.actualPort,
    tokens: await listIntegrationTokens(),
    recentLogs: await integrationAudit()
  }
}

export async function applyIntegrationConfiguration(): Promise<void> {
  const configuration = await readIntegrationConfiguration()
  app.setLoginItemSettings({ openAtLogin: configuration.startWithWindows, args: ['--integration'] })
  if (configuration.enabled) await integrationServer.start(configuration)
  else await integrationServer.stop()
  syncIntegrationTray()
}

export function registerIntegrationIpc(): void {
  handle('integration:status', () => fromService('Reading integration status', status))
  handle('integration:save', (request) =>
    fromService('Saving integration settings', async () => {
      await writeIntegrationConfiguration(request)
      await applyIntegrationConfiguration()
      return status()
    })
  )
  handle('integration:createToken', (request) =>
    fromService('Creating API token', () => createIntegrationToken(request.name, request.scopes))
  )
  handle('integration:revokeToken', (request) =>
    fromService('Revoking API token', () => revokeIntegrationToken(request.id))
  )
}
