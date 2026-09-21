/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { PrintSettings } from '@shared/printSettings'
/**
 * The printing port.
 *
 * A label reaches paper by one of three routes that share nothing below this
 * interface: the installed Windows driver rasterizes for us, the raw spooler
 * carries printer command language through untouched, and port 9100 is a bare
 * TCP socket to the device.
 */

import type { PrinterInfo, PrinterTransport, PrintJobResult } from '@shared/ipc/contract'
import type { LabelTemplate, LabelDocument } from '@shared/template/types'

/** One print run as handed to an adapter. */
export interface PrintJob {
  id?: string
  document?: LabelDocument
  documents?: LabelDocument[]
  settings?: PrintSettings
  printerId: string
  copies: number
  /** Resolved values for the template's prompt variables, keyed by name. */
  values: Record<string, string>
  /**
   * The label to print. Null until the main process owns the open document;
   * today the renderer holds it and the IPC layer has nothing to put here.
   */
  template: LabelTemplate | null
}

export interface PrinterAdapter {
  readonly transport: PrinterTransport
  readonly displayName: string
  listPrinters(): Promise<PrinterInfo[]>
  print(job: PrintJob): Promise<PrintJobResult>
}
