/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { dialog, nativeImage } from 'electron'
import koffi from 'koffi'
import { DEFAULT_PRINT_SETTINGS, printLayout } from '@shared/printSettings'
import type { PrintJobResult } from '@shared/ipc/contract'
import type { PrinterAdapter, PrintJob } from './types'
import { configureDevMode } from './gdiDevMode'
import { renderPagePng } from './renderWindow'
import { getMainWindow } from '../windows/mainWindow'

// Koffi calling conventions, aggregate types and output buffers:
// https://koffi.dev/start and https://koffi.dev/output
// Win32 print sequence and ownership:
// https://learn.microsoft.com/windows/win32/printdocs/how-to--print-using-the-gdi-print-api
// https://learn.microsoft.com/windows/win32/printdocs/documentproperties

const DM_OUT_BUFFER = 0x2,
  DM_IN_PROMPT = 0x4,
  DM_IN_BUFFER = 0x8,
  IDOK = 1,
  IDCANCEL = 2,
  LOGPIXELSX = 88,
  LOGPIXELSY = 90,
  DIB_RGB_COLORS = 0,
  SRCCOPY = 0x00cc0020

interface NativeApi {
  PrinterInfo4: ReturnType<typeof koffi.struct>
  EnumPrintersW: (
    flags: number,
    name: null,
    level: number,
    buffer: Buffer | null,
    size: number,
    needed: number[],
    returned: number[]
  ) => number
  OpenPrinterW: (name: string, output: Array<bigint | null>, defaults: null) => number
  ClosePrinter: (printer: bigint) => number
  DocumentPropertiesW: (
    window: bigint | null,
    printer: bigint,
    name: string,
    output: Buffer | null,
    input: Buffer | null,
    mode: number
  ) => number
  CreateDCW: (driver: null, device: string, port: null, mode: Buffer) => bigint | null
  DeleteDC: (dc: bigint) => number
  GetDeviceCaps: (dc: bigint, index: number) => number
  StartDocW: (dc: bigint, info: Record<string, unknown>) => number
  StartPage: (dc: bigint) => number
  EndPage: (dc: bigint) => number
  EndDoc: (dc: bigint) => number
  AbortDoc: (dc: bigint) => number
  StretchDIBits: (...args: unknown[]) => number
}

let loaded: NativeApi | null = null

function api(): NativeApi {
  if (process.platform !== 'win32')
    throw new Error('Native GDI printing is available on Windows only.')
  if (loaded) return loaded
  const winspool = koffi.load('winspool.drv'),
    gdi = koffi.load('gdi32.dll'),
    HANDLE = koffi.pointer('BARISTA_HANDLE', koffi.opaque()),
    HDC = koffi.pointer('BARISTA_HDC', koffi.opaque()),
    DOCINFOW = koffi.struct('BARISTA_DOCINFOW', {
      cbSize: 'int32_t',
      lpszDocName: 'str16',
      lpszOutput: 'str16',
      lpszDatatype: 'str16',
      fwType: 'uint32_t'
    }),
    BITMAPINFOHEADER = koffi.struct('BARISTA_BITMAPINFOHEADER', {
      biSize: 'uint32_t',
      biWidth: 'int32_t',
      biHeight: 'int32_t',
      biPlanes: 'uint16_t',
      biBitCount: 'uint16_t',
      biCompression: 'uint32_t',
      biSizeImage: 'uint32_t',
      biXPelsPerMeter: 'int32_t',
      biYPelsPerMeter: 'int32_t',
      biClrUsed: 'uint32_t',
      biClrImportant: 'uint32_t'
    }),
    PRINTER_INFO_4W = koffi.struct('BARISTA_PRINTER_INFO_4W', {
      pPrinterName: 'str16',
      pServerName: 'str16',
      Attributes: 'uint32_t'
    })
  loaded = {
    PrinterInfo4: PRINTER_INFO_4W,
    EnumPrintersW: winspool.func('__stdcall', 'EnumPrintersW', 'int', [
      'uint32_t',
      'str16',
      'uint32_t',
      koffi.out(koffi.pointer('uint8_t')),
      'uint32_t',
      koffi.out(koffi.pointer('uint32_t')),
      koffi.out(koffi.pointer('uint32_t'))
    ]) as NativeApi['EnumPrintersW'],
    OpenPrinterW: winspool.func('__stdcall', 'OpenPrinterW', 'int', [
      'str16',
      koffi.out(koffi.pointer(HANDLE)),
      'void *'
    ]) as NativeApi['OpenPrinterW'],
    ClosePrinter: winspool.func('__stdcall', 'ClosePrinter', 'int', [
      HANDLE
    ]) as NativeApi['ClosePrinter'],
    DocumentPropertiesW: winspool.func('__stdcall', 'DocumentPropertiesW', 'long', [
      'void *',
      HANDLE,
      'str16',
      'void *',
      'const void *',
      'uint32_t'
    ]) as NativeApi['DocumentPropertiesW'],
    CreateDCW: gdi.func('__stdcall', 'CreateDCW', HDC, [
      'str16',
      'str16',
      'str16',
      'const void *'
    ]) as NativeApi['CreateDCW'],
    DeleteDC: gdi.func('__stdcall', 'DeleteDC', 'int', [HDC]) as NativeApi['DeleteDC'],
    GetDeviceCaps: gdi.func('__stdcall', 'GetDeviceCaps', 'int', [
      HDC,
      'int'
    ]) as NativeApi['GetDeviceCaps'],
    StartDocW: gdi.func('__stdcall', 'StartDocW', 'int', [
      HDC,
      koffi.pointer(DOCINFOW)
    ]) as NativeApi['StartDocW'],
    StartPage: gdi.func('__stdcall', 'StartPage', 'int', [HDC]) as NativeApi['StartPage'],
    EndPage: gdi.func('__stdcall', 'EndPage', 'int', [HDC]) as NativeApi['EndPage'],
    EndDoc: gdi.func('__stdcall', 'EndDoc', 'int', [HDC]) as NativeApi['EndDoc'],
    AbortDoc: gdi.func('__stdcall', 'AbortDoc', 'int', [HDC]) as NativeApi['AbortDoc'],
    StretchDIBits: gdi.func('__stdcall', 'StretchDIBits', 'int', [
      HDC,
      'int',
      'int',
      'int',
      'int',
      'int',
      'int',
      'int',
      'int',
      'const void *',
      koffi.pointer(BITMAPINFOHEADER),
      'uint32_t',
      'uint32_t'
    ]) as NativeApi['StretchDIBits']
  }
  return loaded
}

export function listNativePrinterNames(): string[] {
  const native = api(),
    needed = [0],
    returned = [0]
  native.EnumPrintersW(0x6, null, 4, null, 0, needed, returned)
  if (!needed[0] || needed[0] > 10_000_000) return []
  const buffer = Buffer.alloc(needed[0])
  if (!native.EnumPrintersW(0x6, null, 4, buffer, buffer.length, needed, returned)) return []
  const entries = koffi.decode(buffer, native.PrinterInfo4, returned[0] ?? 0) as Array<{
    pPrinterName: string | null
  }>
  return entries.flatMap((entry) => (entry.pPrinterName ? [entry.pPrinterName] : []))
}

function withPrinter<T>(name: string, run: (printer: bigint, native: NativeApi) => T): T {
  const native = api(),
    output: Array<bigint | null> = [null]
  if (!native.OpenPrinterW(name, output, null) || !output[0])
    throw new Error(`Windows could not open printer “${name}”.`)
  try {
    return run(output[0], native)
  } finally {
    native.ClosePrinter(output[0])
  }
}

function currentDevMode(name: string, saved?: string): Buffer {
  return withPrinter(name, (printer, native) => {
    const size = native.DocumentPropertiesW(null, printer, name, null, null, 0)
    if (size <= 0 || size > 1_000_000)
      throw new Error('The printer driver returned an invalid DEVMODE size.')
    const output = Buffer.alloc(size),
      decoded = saved ? Buffer.from(saved, 'base64') : null,
      input = decoded?.length === size ? decoded : null,
      mode = input ? DM_IN_BUFFER | DM_OUT_BUFFER : DM_OUT_BUFFER
    if (native.DocumentPropertiesW(null, printer, name, output, input, mode) !== IDOK)
      throw new Error('The printer driver could not initialize its settings.')
    return output
  })
}

function normalizeDevMode(name: string, input: Buffer): Buffer {
  return withPrinter(name, (printer, native) => {
    const output = Buffer.alloc(input.length)
    if (
      native.DocumentPropertiesW(
        null,
        printer,
        name,
        output,
        input,
        DM_IN_BUFFER | DM_OUT_BUFFER
      ) !== IDOK
    )
      throw new Error('The printer driver rejected the requested paper settings.')
    return output
  })
}

export function showPrinterProperties(
  printerName: string,
  parentWindow: bigint | null,
  saved?: string
): string | null {
  return withPrinter(printerName, (printer, native) => {
    const defaults = currentDevMode(printerName, saved),
      output = Buffer.alloc(defaults.length),
      result = native.DocumentPropertiesW(
        parentWindow,
        printer,
        printerName,
        output,
        defaults,
        DM_IN_PROMPT | DM_IN_BUFFER | DM_OUT_BUFFER
      )
    if (result === IDCANCEL) return null
    if (result !== IDOK) throw new Error('The printer driver properties dialog failed.')
    return output.toString('base64')
  })
}

export class GdiPrinter implements PrinterAdapter {
  readonly transport = 'driver' as const
  readonly displayName = 'Windows GDI'

  async listPrinters() {
    const { DriverPrinter } = await import('./driver')
    return new DriverPrinter().listPrinters()
  }

  async print(job: PrintJob): Promise<PrintJobResult> {
    const documents = job.documents ?? (job.document ? [job.document] : [])
    if (!documents.length) throw new Error('No label was supplied.')
    const settings = job.settings ?? DEFAULT_PRINT_SETTINGS,
      page = printLayout(documents[0]!.template.stock, settings),
      initialMode = currentDevMode(job.printerId, settings.gdiDevMode)
    configureDevMode(initialMode, {
      widthMm: page.width,
      heightMm: page.height,
      dpiX: documents[0]!.template.stock.dpi,
      dpiY: documents[0]!.template.stock.dpi,
      copies: job.copies,
      collate: settings.collate
    })
    const mode = normalizeDevMode(job.printerId, initialMode),
      native = api()
    let outputPath: string | null = null
    if (job.printerId === 'Microsoft Print to PDF') {
      const options = {
          title: 'Save native label PDF',
          defaultPath: `${documents[0]!.template.metadata.title}.pdf`,
          filters: [{ name: 'PDF document', extensions: ['pdf'] }]
        },
        win = getMainWindow(),
        result = await (win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options))
      if (result.canceled || !result.filePath) throw new Error('PDF saving was cancelled.')
      outputPath = result.filePath
    }
    const dc = native.CreateDCW(null, job.printerId, null, mode)
    if (!dc) throw new Error('Windows could not create a printer device context.')
    let started = false
    try {
      const dpiX = native.GetDeviceCaps(dc, LOGPIXELSX),
        dpiY = native.GetDeviceCaps(dc, LOGPIXELSY)
      if (dpiX <= 0 || dpiY <= 0 || dpiX > 9600 || dpiY > 9600)
        throw new Error('The printer driver reported an invalid resolution.')
      const nativeJob = native.StartDocW(dc, {
        cbSize: koffi.sizeof(koffi.type('BARISTA_DOCINFOW')),
        lpszDocName: documents[0]!.template.metadata.title || 'Barista label',
        lpszOutput: outputPath,
        lpszDatatype: null,
        fwType: 0
      })
      if (nativeJob <= 0) throw new Error('Windows could not start the native print job.')
      started = true
      for (const document of documents) {
        if (native.StartPage(dc) <= 0) throw new Error('Windows could not start a print page.')
        const png = await renderPagePng(document, settings, dpiX, dpiY),
          image = nativeImage.createFromBuffer(Buffer.from(png)),
          size = image.getSize(),
          pixels = image.toBitmap(),
          header = {
            biSize: 40,
            biWidth: size.width,
            biHeight: -size.height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            biSizeImage: pixels.length,
            biXPelsPerMeter: Math.round(dpiX / 0.0254),
            biYPelsPerMeter: Math.round(dpiY / 0.0254),
            biClrUsed: 0,
            biClrImportant: 0
          },
          copied = native.StretchDIBits(
            dc,
            0,
            0,
            size.width,
            size.height,
            0,
            0,
            size.width,
            size.height,
            pixels,
            header,
            DIB_RGB_COLORS,
            SRCCOPY
          )
        if (copied <= 0) throw new Error('The printer driver rejected the label bitmap.')
        if (native.EndPage(dc) <= 0) throw new Error('Windows could not finish the print page.')
      }
      if (native.EndDoc(dc) <= 0) throw new Error('Windows could not submit the native print job.')
      started = false
      return {
        jobId: job.id ?? `gdi-${nativeJob}`,
        submittedAt: new Date().toISOString()
      }
    } catch (error) {
      if (started) native.AbortDoc(dc)
      throw new Error(
        `Native Windows printing failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    } finally {
      native.DeleteDC(dc)
    }
  }
}
