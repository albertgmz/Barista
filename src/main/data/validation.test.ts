/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import {
  parsePrintHistoryEntry,
  parsePrintTrackingRecord,
  parseTemplateLibraryEntry
} from './validation'

describe('repository boundary validation', () => {
  it('rejects invalid enum values returned by an external database', () => {
    expect(() =>
      parsePrintHistoryEntry({
        id: 'job',
        date: '2026-09-20T12:00:00.000Z',
        user: 'operator',
        computer: 'station',
        template: 'label',
        printer: 'printer',
        serialRange: '',
        serializedLabels: 1,
        copies: 1,
        result: 'unknown'
      })
    ).toThrow()
    expect(() =>
      parsePrintTrackingRecord({
        dataSourceId: 'source',
        recordKey: 'row',
        status: 'unknown',
        lastPrintDate: '2026-09-20T12:00:00.000Z',
        jobId: 'job',
        serialUsed: null,
        rowHash: 'hash',
        voidReason: null
      })
    ).toThrow()
    expect(() =>
      parseTemplateLibraryEntry({
        id: 'template',
        path: 'C:/label.bar',
        title: 'Label',
        description: '',
        tags: [],
        status: 'unknown',
        thumbnailPath: null,
        modifiedAt: '2026-09-20T12:00:00.000Z',
        indexedAt: '2026-09-20T12:00:00.000Z'
      })
    ).toThrow()
  })
})
