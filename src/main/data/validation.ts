/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { z } from 'zod'
import type { PrintHistoryEntry } from '@shared/ipc/contract'
import type { PrintTrackingRecord, TemplateLibraryEntry } from './types'

const identifier = z.string().min(1).max(512)
const isoDate = z.iso.datetime({ offset: true })

const printHistoryEntrySchema: z.ZodType<PrintHistoryEntry> = z.object({
  id: identifier,
  date: isoDate,
  user: z.string().max(512),
  computer: z.string().max(512),
  template: z.string().max(2048),
  printer: z.string().max(2048),
  serialRange: z.string().max(2048),
  serializedLabels: z.number().int().min(1).max(1_000_000),
  copies: z.number().int().min(1).max(1_000_000),
  result: z.enum(['done', 'failed']),
  error: z.string().max(16_384).optional()
})

const printTrackingRecordSchema: z.ZodType<PrintTrackingRecord> = z.object({
  dataSourceId: identifier,
  recordKey: z.string().min(1).max(4096),
  status: z.enum(['printed', 'reprinted', 'voided', 'failed']),
  lastPrintDate: isoDate,
  jobId: identifier,
  serialUsed: z.string().max(2048).nullable(),
  rowHash: z.string().min(1).max(256),
  voidReason: z.string().max(4096).nullable()
})

const templateLibraryEntrySchema: z.ZodType<TemplateLibraryEntry> = z.object({
  id: identifier,
  path: z.string().min(1).max(32_768),
  title: z.string().min(1).max(2048),
  description: z.string().max(16_384),
  tags: z.array(z.string().min(1).max(256)).max(100),
  status: z.enum(['draft', 'approved']),
  thumbnailPath: z.string().max(32_768).nullable(),
  modifiedAt: isoDate,
  indexedAt: isoDate
})

export const parsePrintHistoryEntry = (value: unknown): PrintHistoryEntry =>
  printHistoryEntrySchema.parse(value)

export const parsePrintTrackingRecord = (value: unknown): PrintTrackingRecord =>
  printTrackingRecordSchema.parse(value)

export const parseTemplateLibraryEntry = (value: unknown): TemplateLibraryEntry =>
  templateLibraryEntrySchema.parse(value)
