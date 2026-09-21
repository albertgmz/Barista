/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { hostname, userInfo } from 'node:os'
import { dataRepositories } from '@main/data'
import { DriverPrinter } from '@main/printing/driver'
import { PrintQueue } from '@main/printing/queue'
import { withPrintWindow, renderPdf, renderPng } from '@main/printing/renderWindow'
import { DEFAULT_PRINT_SETTINGS, printSettingsSchema } from '@shared/printSettings'
import { documentSchema } from '@shared/template/schema'
import { getMainWindow } from '@main/windows/mainWindow'
import { recordPrintFailure, recordPrintSuccess } from '@main/dataSources/tracking'
import {
  counterValue,
  evaluatedDocument,
  evaluateVariables,
  formatCounter
} from '@shared/variables'
import { fromService, handle } from './typedIpc'
import { SettingsStoreFile } from '@main/storage/settings'
import { batchPreflight, preflight } from '@shared/preflight'
import { listInstalledFonts } from '@main/fonts'
import type { PrintJobRequest, PrintJobResult } from '@shared/ipc/contract'
import { showPrinterProperties } from '@main/printing/gdi'
import { diagnosticLog } from '@main/diagnostics'
const driver = new DriverPrinter(),
  queue = new PrintQueue(driver)
const previewDocuments = new Map<string, Parameters<typeof withPrintWindow>[0]>()
let submissionHandler: ((request: PrintJobRequest) => Promise<PrintJobResult>) | null = null
export function submitPrintRequest(request: PrintJobRequest): Promise<PrintJobResult> {
  if (!submissionHandler) throw new Error('Printing is not initialized.')
  return submissionHandler(request)
}
export function registerPrintIpc(): void {
  handle('printer:list', () => fromService('Printer discovery', () => driver.listPrinters()))
  submissionHandler = async (request) => {
    const startedAt = performance.now()
    diagnosticLog.info('print.started', {
      printer: request.printerId,
      copies: request.copies,
      recordCount: request.records?.length ?? request.serializedLabels,
      template: request.document.template.metadata.title
    })
    const repositories = dataRepositories()
    documentSchema.parse(request.document)
    printSettingsSchema.parse(request.settings)
    if (
      !Number.isInteger(request.serializedLabels) ||
      request.serializedLabels < 1 ||
      request.serializedLabels > 100000
    )
      throw new Error('Serialized labels must be between 1 and 100,000.')
    const records = request.records ?? []
    const recordCount = records.length || request.serializedLabels
    if (!Number.isInteger(recordCount) || recordCount < 1 || recordCount > 100000)
      throw new Error('A print job must contain between 1 and 100,000 records.')
    if (records.length && request.serializedLabels !== records.length)
      throw new Error('The selected record count does not match the requested label count.')
    if (records.some((record) => !record.key.trim()))
      throw new Error('Records with empty keys cannot be printed.')
    if (new Set(records.map((record) => record.key)).size !== records.length)
      throw new Error('The selected records contain duplicate keys. Choose each key only once.')
    const sourceIds = new Set(request.document.template.dataSources.map((source) => source.id))
    if (
      records.some(
        (record) =>
          !sourceIds.has(record.dataSourceId) ||
          record.key.length > 4096 ||
          !/^[a-f0-9]{64}$/.test(record.rowHash) ||
          Object.keys(record.fields).length > 1000 ||
          Object.values(record.fields).some((value) => value.length > 100000)
      )
    )
      throw new Error('One or more selected data records are invalid.')
    const counters = request.document.template.variables.filter(
      (variable) => variable.kind === 'counter'
    )
    const validation = evaluateVariables(request.document.template.variables, {
      prompts: request.values,
      fields: records[0]?.fields
    })
    if (validation.errors.length) throw new Error(validation.errors.join('\n'))
    for (const counter of counters) counterValue(counter, recordCount - 1)
    const appSettings = await new SettingsStoreFile().read()
    if (appSettings.preflightMode === 'strict') {
      const fontCatalog = await listInstalledFonts(request.document)
      const installedFonts = fontCatalog.families.flatMap((font) => [font.family, ...font.aliases])
      const templateReport = preflight(request.document, {
        prompts: request.values,
        fields: records[0]?.fields,
        installedFonts
      })
      const batchReport = batchPreflight(
        request.document,
        Array.from({ length: recordCount }, (_, index) => ({
          key: records[index]?.key ?? String(index + 1),
          fields: records[index]?.fields ?? {}
        })),
        { prompts: request.values, installedFonts }
      )
      if (templateReport.errors || batchReport.rowsWithErrors) {
        const first =
          templateReport.issues.find((issue) => issue.severity === 'error') ??
          batchReport.rows.flatMap((row) => row.issues).find((issue) => issue.severity === 'error')
        throw new Error(
          `Strict preflight blocked printing: ${templateReport.errors} template errors and ${batchReport.rowsWithErrors} rows with errors.${first ? ` ${first.message}` : ''}`
        )
      }
    }
    const persistentCounters = counters
    const reservations = []
    try {
      for (const counter of persistentCounters)
        reservations.push(await repositories.serials.reserve(counter, recordCount))
    } catch (error) {
      await Promise.all(
        reservations.map((reservation) => repositories.serials.fail(reservation.id, 'release'))
      )
      throw error
    }
    const counterValues = new Map(
      reservations.map((reservation) => [reservation.counterId, reservation.values])
    )
    const documents = Array.from({ length: recordCount }, (_, index) => {
      const values = Object.fromEntries(
        counters.map((counter) => {
          const key =
            counter.scope === 'global' && counter.sharedName
              ? `shared:${counter.sharedName}`
              : `template:${counter.id}`
          return [counter.name, counterValues.get(key)?.[index] ?? counterValue(counter, index)]
        })
      )
      const evaluated = evaluatedDocument(request.document, {
        prompts: request.values,
        counters: values,
        fields: records[index]?.fields
      })
      if (evaluated.errors.length) throw new Error(evaluated.errors.join('\n'))
      return evaluated.document
    })
    const firstCounter = counters[0]
    const firstValues = firstCounter
      ? Array.from({ length: recordCount }, (_, index) => {
          const key =
            firstCounter.scope === 'global' && firstCounter.sharedName
              ? `shared:${firstCounter.sharedName}`
              : `template:${firstCounter.id}`
          return counterValues.get(key)?.[index] ?? counterValue(firstCounter, index)
        })
      : []
    const serialRange =
      firstCounter && firstValues.length
        ? `${formatCounter(firstCounter, firstValues[0]!)}–${formatCounter(firstCounter, firstValues.at(-1)!)}`
        : ''
    const date = new Date().toISOString()
    let result: 'done' | 'failed' = 'done',
      error: string | undefined,
      jobId = `${date}-${Math.random().toString(36).slice(2)}`,
      accepted = false
    try {
      const printed = await queue.enqueue({
        ...request,
        documents,
        document: documents[0],
        template: documents[0]!.template
      })
      accepted = true
      await Promise.all(
        reservations.map((reservation) => repositories.serials.commit(reservation.id))
      )
      jobId = printed.jobId
      await recordPrintSuccess(
        repositories.printTracking,
        records,
        printed.jobId,
        printed.submittedAt,
        records.map((_, index) =>
          firstCounter && firstValues[index] !== undefined
            ? formatCounter(firstCounter, firstValues[index]!)
            : null
        )
      )
      if (records.length)
        await repositories.settings.write(
          `print.jobRecords.${printed.jobId}`,
          records.map((record) => ({ dataSourceId: record.dataSourceId, key: record.key }))
        )
      return { ...printed, serialRange }
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught)
      result = accepted ? 'done' : 'failed'
      error = accepted
        ? `The printer accepted the job, but final tracking failed: ${detail}. Do not reprint until history is reconciled.`
        : detail
      if (!accepted) {
        await Promise.all(
          reservations.map((reservation, index) =>
            repositories.serials.fail(reservation.id, persistentCounters[index]!.failure)
          )
        )
        await recordPrintFailure(repositories.printTracking, records, jobId, date)
      }
      throw new Error(error, { cause: caught })
    } finally {
      await repositories.printHistory.append({
        id: jobId,
        date,
        user: userInfo().username,
        computer: hostname(),
        template: request.document.template.metadata.title,
        printer: request.printerId,
        serialRange,
        serializedLabels: recordCount,
        copies: request.copies,
        result,
        ...(error ? { error } : {})
      })
      diagnosticLog.info('print.finished', {
        printer: request.printerId,
        result,
        error,
        durationMs: Math.round(performance.now() - startedAt),
        recordCount
      })
    }
  }
  handle('print:submit', (request) => fromService('Printing', () => submitPrintRequest(request)))
  handle('print:history', () =>
    fromService('Print history', () => dataRepositories().printHistory.list())
  )
  handle('print:promptValuesRead', (request) =>
    fromService('Prompt values', () => dataRepositories().promptValues.read(request.templateId))
  )
  handle('print:promptValuesWrite', (request) =>
    fromService('Prompt values', () =>
      dataRepositories().promptValues.write(request.templateId, request.values)
    )
  )
  handle('print:settingsRead', (request) =>
    fromService('Printer settings', async () => {
      const saved = await dataRepositories().printerProfiles.read(request.printerId)
      if (saved) return saved
      const printer = (await driver.listPrinters()).find((p) => p.id === request.printerId)
      return {
        ...DEFAULT_PRINT_SETTINGS,
        paperWidthMm: printer?.paperWidthMm ?? 210,
        paperHeightMm: printer?.paperHeightMm ?? 297,
        marginMm: printer?.marginMm ?? 0
      }
    })
  )
  handle('print:settingsWrite', (request) =>
    fromService('Saving printer settings', async () => {
      const settings = printSettingsSchema.parse(request.settings)
      await dataRepositories().printerProfiles.write(request.printerId, settings)
    })
  )
  handle('print:properties', (request) =>
    fromService('Printer properties', async () => {
      const handle = getMainWindow()?.getNativeWindowHandle()
      const parent = handle
        ? handle.length >= 8
          ? handle.readBigUInt64LE()
          : BigInt(handle.readUInt32LE())
        : null
      return showPrinterProperties(request.printerId, parent, request.devMode)
    })
  )
  handle('print:preview', (request) =>
    fromService('Print preview', () => {
      if (request.document) {
        documentSchema.parse(request.document)
        previewDocuments.delete(request.documentId)
        previewDocuments.set(request.documentId, request.document)
        if (previewDocuments.size > 10)
          previewDocuments.delete(previewDocuments.keys().next().value!)
      }
      const document = previewDocuments.get(request.documentId)
      if (!document) throw new Error('The print preview document expired. Please reopen Print.')
      return withPrintWindow(
        document,
        request.settings,
        async (_win, svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      )
    })
  )
  handle('document:export', (request) =>
    fromService('Exporting label', async () => {
      documentSchema.parse(request.document)
      if (request.format !== 'pdf' && request.format !== 'png')
        throw new Error('Unsupported export format.')
      const win = getMainWindow(),
        options = {
          title: `Export ${request.format.toUpperCase()}`,
          defaultPath: `${request.document.template.metadata.title}.${request.format}`,
          filters: [{ name: request.format.toUpperCase(), extensions: [request.format] }]
        }
      const result = await (win
        ? dialog.showSaveDialog(win, options)
        : dialog.showSaveDialog(options))
      if (result.canceled || !result.filePath) return null
      const bytes =
        request.format === 'pdf'
          ? await renderPdf(request.document, undefined, { sample: true })
          : await renderPng(request.document, { sample: true })
      await writeFile(result.filePath, bytes)
      return result.filePath
    })
  )
}
