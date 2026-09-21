/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { PrinterInfo, PrintJobResult } from '@shared/ipc/contract'
import { NotImplementedError } from '@shared/errors'
import type { PrinterAdapter, PrintJob } from './types'

/** Streams raw printer commands over TCP to a network printer on port 9100. */
export class Network9100Printer implements PrinterAdapter {
  readonly transport = 'network-9100' as const
  readonly displayName = 'Network (port 9100)'

  // TODO: network printers are configured by the user rather than discovered;
  // list the host:port entries saved in settings.
  async listPrinters(): Promise<PrinterInfo[]> {
    throw new NotImplementedError('Network printer discovery')
  }

  // TODO: open a net.Socket to host:9100, write the rendered command bytes,
  // end the socket, and treat a connect or write error as a failed job.
  async print(_job: PrintJob): Promise<PrintJobResult> {
    throw new NotImplementedError('Network printing')
  }
}
