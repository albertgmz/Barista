/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { fromService, handle } from './typedIpc'
import {
  createDiagnosticReport,
  openDiagnosticFolder,
  openLogsFolder,
  readDiagnosticLogs,
  showDiagnosticFile,
  viewDiagnosticBundle
} from '../diagnostics/service'
import { dismissPendingCrashNotice, pendingCrashNotice } from '../diagnostics/crash'
import { recordBreadcrumb } from '../diagnostics/breadcrumbs'
import { clipboard } from 'electron'

export function registerDiagnosticsIpc(): void {
  handle('diagnostics:create', (request) =>
    fromService('Creating diagnostic report', () => createDiagnosticReport(request))
  )
  handle('diagnostics:logs', () => fromService('Reading diagnostic logs', readDiagnosticLogs))
  handle('diagnostics:openLogsFolder', () => fromService('Opening logs folder', openLogsFolder))
  handle('diagnostics:openFolder', () =>
    fromService('Opening diagnostics folder', openDiagnosticFolder)
  )
  handle('diagnostics:showFile', (request) =>
    fromService('Showing diagnostic report', async () => showDiagnosticFile(request.path))
  )
  handle('diagnostics:crashNotice', pendingCrashNotice)
  handle('diagnostics:dismissCrashNotice', (request) => dismissPendingCrashNotice(request.id))
  handle('diagnostics:viewBundle', (request) =>
    fromService('Reading diagnostic report', () => viewDiagnosticBundle(request.path))
  )
  handle('diagnostics:breadcrumb', (request) => {
    recordBreadcrumb(request)
  })
  handle('diagnostics:copyLogs', (request) =>
    fromService('Copying diagnostic logs', async () => {
      if (request.text.length > 2_000_000) throw new Error('Too many log lines were selected.')
      clipboard.writeText(request.text)
    })
  )
}
