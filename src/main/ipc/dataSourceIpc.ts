/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app, dialog, type OpenDialogOptions } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { dataRepositories } from '@main/data'
import {
  inspectWorkbook,
  readDataSource,
  resolveDataSourcePath,
  workbookHeaders
} from '@main/dataSources/workbook'
import { mergePrintTracking } from '@main/dataSources/tracking'
import { getMainWindow } from '@main/windows/mainWindow'
import type { DataSourceReadResult } from '@shared/dataSources'
import { fromService, handle, sendTo } from './typedIpc'
import { diagnosticLog } from '@main/diagnostics'

const watchers = new Map<
  string,
  { watcher: FSWatcher; timer: ReturnType<typeof setTimeout> | null }
>()

function stopWatching(sourceId: string): void {
  const active = watchers.get(sourceId)
  if (!active) return
  if (active.timer) clearTimeout(active.timer)
  active.watcher.close()
  watchers.delete(sourceId)
}

export function registerDataSourceIpc(): void {
  handle('dataSource:showOpenDialog', () =>
    fromService('Choosing a data source', async () => {
      const win = getMainWindow()
      const options: OpenDialogOptions = {
        title: 'Choose data source',
        properties: ['openFile'],
        filters: [
          { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] },
          { name: 'All files', extensions: ['*'] }
        ]
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    })
  )
  handle('dataSource:inspect', (request) =>
    fromService('Inspecting the workbook', () => {
      const path = resolveDataSourcePath(request.path, request.documentPath)
      diagnosticLog.info('data-source.inspect', { path })
      return inspectWorkbook(path)
    })
  )
  handle('dataSource:headers', (request) =>
    fromService('Reading spreadsheet columns', () =>
      (() => {
        const path = resolveDataSourcePath(request.path, request.documentPath)
        diagnosticLog.info('data-source.headers', { path, headerRow: request.headerRow })
        return workbookHeaders(path, request.selection, request.headerRow)
      })()
    )
  )
  handle('dataSource:read', (request) =>
    fromService('Reading the data source', async () => {
      const parsed = await readDataSource(request.source, request.documentPath)
      diagnosticLog.info('data-source.read', {
        sourceId: request.source.id,
        path: parsed.path,
        rowCount: parsed.rows.length,
        columnCount: parsed.columns.length,
        warningCount: parsed.warnings.length
      })
      const result: DataSourceReadResult = {
        sourceId: request.source.id,
        path: parsed.path,
        columns: parsed.columns,
        warnings: parsed.warnings,
        modifiedAt: parsed.modifiedAt,
        records: await mergePrintTracking(
          dataRepositories().printTracking,
          request.source.id,
          parsed.rows
        )
      }
      return result
    })
  )
  handle('dataSource:watch', (request) =>
    fromService('Watching the data source', async () => {
      stopWatching(request.source.id)
      const path = resolveDataSourcePath(request.source.path, request.documentPath)
      const active = {
        watcher: null as unknown as FSWatcher,
        timer: null as ReturnType<typeof setTimeout> | null
      }
      active.watcher = watch(path, () => {
        if (active.timer) clearTimeout(active.timer)
        active.timer = setTimeout(() => {
          const win = getMainWindow()
          if (win) sendTo(win, 'dataSource:changed', { sourceId: request.source.id, path })
        }, 250)
      })
      active.watcher.on('error', () => stopWatching(request.source.id))
      watchers.set(request.source.id, active)
      diagnosticLog.info('data-source.watch', { sourceId: request.source.id, path })
    })
  )
  handle('dataSource:unwatch', (request) =>
    fromService('Stopping the data-source watcher', async () => stopWatching(request.sourceId))
  )
  handle('dataSource:void', (request) =>
    fromService('Voiding the record', async () => {
      const reason = request.reason.trim()
      if (!reason) throw new Error('A reason is required to void a record.')
      const repository = dataRepositories().printTracking
      const existing = await repository.read(request.dataSourceId, request.recordKey)
      if (!existing) throw new Error('Only a previously tracked record can be voided.')
      await repository.write({
        ...existing,
        status: 'voided',
        lastPrintDate: new Date().toISOString(),
        voidReason: reason
      })
      diagnosticLog.info('data-source.record-voided', { dataSourceId: request.dataSourceId })
    })
  )
  app.once('before-quit', () => {
    for (const sourceId of [...watchers.keys()]) stopWatching(sourceId)
  })
}
