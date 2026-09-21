/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { Notification } from 'electron'
import { newId } from '@shared/template/document'
import type { PrintJobResult } from '@shared/ipc/contract'
import type { PrintJob } from './types'
import { DriverPrinter } from './driver'
import { getMainWindow } from '../windows/mainWindow'
export type PrintJobState = 'queued' | 'printing' | 'done' | 'failed'
export interface PrintJobStatus {
  jobId: string
  state: PrintJobState
  error?: string
}
export class PrintQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private jobs = new Map<string, PrintJobStatus>()
  constructor(private driver = new DriverPrinter()) {}
  private update(jobId: string, state: PrintJobState, error?: string): void {
    const status = { jobId, state, error }
    this.jobs.set(jobId, status)
    if (this.jobs.size > 1000) this.jobs.delete(this.jobs.keys().next().value!)
    const win = getMainWindow()
    win?.webContents.send('print:status', status)
    win?.setProgressBar(state === 'printing' ? 2 : -1)
    if (state === 'done' || state === 'failed')
      new Notification({
        title: state === 'done' ? 'Label sent to printer' : 'Printing failed',
        body: error ?? 'The Windows spooler accepted the job.'
      }).show()
  }
  async enqueue(job: PrintJob): Promise<PrintJobResult> {
    const id = newId()
    this.update(id, 'queued')
    const run = async (): Promise<PrintJobResult> => {
      this.update(id, 'printing')
      try {
        const result = await this.driver.print({ ...job, id })
        this.update(id, 'done')
        return result
      } catch (e) {
        this.update(id, 'failed', e instanceof Error ? e.message : String(e))
        throw e
      }
    }
    const result = this.tail.then(run, run)
    this.tail = result.catch(() => undefined)
    return result
  }
  async status(jobId: string): Promise<PrintJobStatus> {
    const status = this.jobs.get(jobId)
    if (!status) throw new Error('Unknown print job.')
    return status
  }
}
