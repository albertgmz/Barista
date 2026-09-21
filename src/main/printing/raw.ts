/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { PrinterInfo, PrintJobResult } from '@shared/ipc/contract'
import { NotImplementedError } from '@shared/errors'
import type { PrinterAdapter, PrintJob } from './types'

/**
 * Sends printer command language straight to the Windows spooler, bypassing the
 * driver. This is the route for ZPL and TSPL on a USB thermal printer.
 */
export class RawSpoolerPrinter implements PrinterAdapter {
  readonly transport = 'raw-spooler' as const
  readonly displayName = 'Raw spooler'

  // TODO: call EnumPrinters through koffi bindings to winspool.drv and keep the
  // queues whose driver is a thermal one.
  async listPrinters(): Promise<PrinterInfo[]> {
    throw new NotImplementedError('Raw spooler printer discovery')
  }

  // TODO: koffi + winspool.drv - OpenPrinter, StartDocPrinter with the "RAW"
  // datatype, StartPagePrinter, WritePrinter of the rendered command bytes,
  // then unwind End/Close in reverse.
  async print(_job: PrintJob): Promise<PrintJobResult> {
    throw new NotImplementedError('Raw spooler printing')
  }
}
