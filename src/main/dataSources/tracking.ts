/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { DataSourceRecord, DataSourceRecordSelection } from '@shared/dataSources'
import type { PrintTrackingRepository } from '@main/data/types'

export async function mergePrintTracking(
  repository: PrintTrackingRepository,
  dataSourceId: string,
  rows: Array<{ key: string; values: Record<string, string>; rowHash: string }>
): Promise<DataSourceRecord[]> {
  const tracking = new Map(
    (await repository.list(dataSourceId)).map((record) => [record.recordKey, record])
  )
  return rows.map((row) => {
    const previous = tracking.get(row.key)
    return {
      ...row,
      status: previous?.status ?? 'never-printed',
      changed: previous ? previous.rowHash !== row.rowHash : false,
      lastPrintDate: previous?.lastPrintDate ?? null,
      jobId: previous?.jobId ?? null,
      serialUsed: previous?.serialUsed ?? null
    }
  })
}

export async function recordPrintSuccess(
  repository: PrintTrackingRepository,
  records: readonly DataSourceRecordSelection[],
  jobId: string,
  submittedAt: string,
  serials: readonly (string | null)[]
): Promise<void> {
  await Promise.all(
    records.map(async (record, index) => {
      const previous = await repository.read(record.dataSourceId, record.key)
      await repository.write({
        dataSourceId: record.dataSourceId,
        recordKey: record.key,
        status: previous && previous.status !== 'failed' ? 'reprinted' : 'printed',
        lastPrintDate: submittedAt,
        jobId,
        serialUsed: serials[index] ?? null,
        rowHash: record.rowHash,
        voidReason: null
      })
    })
  )
}

export async function recordPrintFailure(
  repository: PrintTrackingRepository,
  records: readonly DataSourceRecordSelection[],
  jobId: string,
  date: string
): Promise<void> {
  await Promise.all(
    records.map((record) =>
      repository.write({
        dataSourceId: record.dataSourceId,
        recordKey: record.key,
        status: 'failed',
        lastPrintDate: date,
        jobId,
        serialUsed: null,
        rowHash: record.rowHash,
        voidReason: null
      })
    )
  )
}
