/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { registerDocumentIpc } from './documentIpc'
import { registerWorkspaceIpc } from './workspaceIpc'
import { registerAppIpc } from './appIpc'
import { registerPrintIpc } from './printIpc'
import { registerSettingsIpc } from './settingsIpc'
import { registerTemplateIpc } from './templateIpc'
import { registerThemeIpc } from './themeIpc'
import { registerDataIpc } from './dataIpc'
import { registerDataSourceIpc } from './dataSourceIpc'
import { registerStationIpc } from './stationIpc'
import { registerIntegrationIpc } from './integrationIpc'
import { registerUpdateIpc } from './updateIpc'
import { registerDiagnosticsIpc } from './diagnosticsIpc'

/** Called once, after the app is ready and before the first window is created. */
export function registerIpcHandlers(): void {
  registerDocumentIpc()
  registerWorkspaceIpc()
  registerAppIpc()
  registerThemeIpc()
  registerTemplateIpc()
  registerPrintIpc()
  registerSettingsIpc()
  registerDataIpc()
  registerDataSourceIpc()
  registerStationIpc()
  registerIntegrationIpc()
  registerUpdateIpc()
  registerDiagnosticsIpc()
}
