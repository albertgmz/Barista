/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import type { PrintTrackingRecord, PrintTrackingRepository } from '@main/data/types'
import { mergePrintTracking, recordPrintFailure, recordPrintSuccess } from './tracking'

class MemoryTracking implements PrintTrackingRepository {
  records = new Map<string, PrintTrackingRecord>()
  async read(dataSourceId: string, recordKey: string): Promise<PrintTrackingRecord | null> {
    return this.records.get(`${dataSourceId}:${recordKey}`) ?? null
  }
  async list(dataSourceId: string): Promise<PrintTrackingRecord[]> {
    return [...this.records.values()].filter((record) => record.dataSourceId === dataSourceId)
  }
  async write(record: PrintTrackingRecord): Promise<void> {
    this.records.set(`${record.dataSourceId}:${record.recordKey}`, record)
  }
}

const selected = [{ dataSourceId: 'source', key: 'EQ-1', rowHash: 'hash-1', fields: {} }]

describe('print tracking workflow', () => {
  it('marks the first print, reprint and changed content', async () => {
    const repository = new MemoryTracking()
    await recordPrintSuccess(repository, selected, 'job-1', '2026-09-20T12:00:00.000Z', ['001'])
    await expect(repository.read('source', 'EQ-1')).resolves.toMatchObject({
      status: 'printed',
      serialUsed: '001'
    })
    await recordPrintSuccess(repository, selected, 'job-2', '2026-09-20T13:00:00.000Z', ['002'])
    await expect(repository.read('source', 'EQ-1')).resolves.toMatchObject({ status: 'reprinted' })
    const merged = await mergePrintTracking(repository, 'source', [
      { key: 'EQ-1', values: {}, rowHash: 'changed-hash' }
    ])
    expect(merged[0]).toMatchObject({ status: 'reprinted', changed: true })
  })

  it('records failed jobs and treats their retry as the first successful print', async () => {
    const repository = new MemoryTracking()
    await recordPrintFailure(repository, selected, 'job-failed', '2026-09-20T12:00:00.000Z')
    await expect(repository.read('source', 'EQ-1')).resolves.toMatchObject({ status: 'failed' })
    await recordPrintSuccess(repository, selected, 'job-retry', '2026-09-20T13:00:00.000Z', [null])
    await expect(repository.read('source', 'EQ-1')).resolves.toMatchObject({ status: 'printed' })
  })
})
