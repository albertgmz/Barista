/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { renderPdf } from './renderWindow'
import { windowsPrinterFacts } from './windowsPrinters'
import type { PrinterInfo, PrintJobResult } from '@shared/ipc/contract'
import { DEFAULT_PRINT_SETTINGS, printLayout } from '@shared/printSettings'
import type { PrinterAdapter, PrintJob } from './types'
import { withPrintWindow } from './renderWindow'
import { getMainWindow } from '../windows/mainWindow'
export class DriverPrinter implements PrinterAdapter {
  readonly transport = 'driver' as const
  readonly displayName = 'Windows driver'
  async listPrinters(): Promise<PrinterInfo[]> {
    const win = getMainWindow()
    if (!win) throw new Error('The printer service is unavailable.')
    const facts = await windowsPrinterFacts()
    const electronPrinters: PrinterInfo[] = (await win.webContents.getPrintersAsync()).map((p) => ({
      id: p.name,
      name: p.name,
      displayName: p.displayName,
      isDefault: (p.options as Record<string, string>)['isDefault'] === 'true',
      transport: 'driver' as const,
      status:
        (p.options as Record<string, string>)['printer-state-reasons'] ?? 'Status unavailable',
      ...facts.get(p.name)
    }))
    const known = new Set(electronPrinters.map((printer) => printer.name))
    for (const [name, fact] of facts)
      if (!known.has(name))
        electronPrinters.push({
          ...fact,
          id: name,
          name,
          displayName: name,
          isDefault: fact.isDefault,
          transport: 'driver',
          status: fact.status
        })
    const { listNativePrinterNames } = await import('./gdi')
    for (const name of listNativePrinterNames())
      if (!electronPrinters.some((printer) => printer.name === name))
        electronPrinters.push({
          id: name,
          name,
          displayName: name,
          isDefault: false,
          transport: 'driver',
          status: 'Status unavailable'
        })
    return electronPrinters
  }
  async print(job: PrintJob): Promise<PrintJobResult> {
    const documents = job.documents ?? (job.document ? [job.document] : [])
    if (!documents.length) throw new Error('No label was supplied.')
    const printer = (await this.listPrinters()).find((p) => p.id === job.printerId)
    if (!printer) throw new Error('Printer not found. Install or select a printer and try again.')
    if (printer.status === 'Offline') throw new Error('The selected printer is offline.')
    const settings = job.settings ?? DEFAULT_PRINT_SETTINGS,
      p = printLayout(documents[0]!.template.stock, settings)
    if (settings.printMethod === 'gdi') {
      const { GdiPrinter } = await import('./gdi')
      return new GdiPrinter().print({ ...job, settings })
    }
    if (printer.name === 'Microsoft Print to PDF') {
      const { PDFDocument } = await import('pdf-lib')
      const win = getMainWindow()
      const options = {
        title: 'Save label PDF',
        defaultPath: `${documents[0]!.template.metadata.title}.pdf`,
        filters: [{ name: 'PDF document', extensions: ['pdf'] }]
      }
      const result = await (win
        ? dialog.showSaveDialog(win, options)
        : dialog.showSaveDialog(options))
      if (result.canceled || !result.filePath) throw new Error('PDF saving was cancelled.')
      const output = await PDFDocument.create()
      for (const document of documents) {
        const source = await PDFDocument.load(await renderPdf(document, settings))
        for (let i = 0; i < job.copies; i++) {
          const [page] = await output.copyPages(source, [0])
          output.addPage(page!)
        }
      }
      const bytes = await output.save()
      await writeFile(result.filePath, bytes)
      return { jobId: job.id ?? String(Date.now()), submittedAt: new Date().toISOString() }
    }
    for (const document of documents)
      await withPrintWindow(document, settings, async (win) => {
        await new Promise<void>((resolve, reject) =>
          win.webContents.print(
            {
              silent: true,
              deviceName: job.printerId,
              margins: { marginType: 'none' },
              pageSize: {
                width: Math.round(Math.min(p.width, p.height) * 1000),
                height: Math.round(Math.max(p.width, p.height) * 1000)
              },
              copies: job.copies,
              collate: settings.collate,
              color: !settings.monochrome,
              dpi: {
                horizontal: document.template.stock.dpi,
                vertical: document.template.stock.dpi
              },
              landscape: p.width > p.height,
              printBackground: true
            },
            (success, reason) =>
              success ? resolve() : reject(new Error(reason || 'Print job failed.'))
          )
        )
      })
    return { jobId: job.id ?? String(Date.now()), submittedAt: new Date().toISOString() }
  }
}
