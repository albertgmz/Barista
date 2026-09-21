/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { z } from 'zod'
import { BAR_FORMAT_NAME } from './types'

const isoTimestamp = z.string().datetime({ offset: true })

export const barAssetEntrySchema = z.object({
  id: z.string().min(1).max(200),
  path: z.string().regex(/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
  byteLength: z.number().int().min(0).max(20_000_000)
})

export const barManifestSchema = z.object({
  format: z.literal(BAR_FORMAT_NAME),
  formatVersion: z.number().int().positive(),
  appVersion: z.string().min(1).max(100),
  createdAt: isoTimestamp,
  modifiedAt: isoTimestamp,
  assets: z.array(barAssetEntrySchema).max(500),
  fonts: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        path: z.string().regex(/^assets\/fonts\/[a-f0-9]{64}\.(ttf|otf|woff2)$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        mimeType: z.enum(['font/ttf', 'font/otf', 'font/woff2']),
        byteLength: z.number().int().positive().max(20_000_000)
      })
    )
    .max(100)
    .default([]),
  preview: z
    .object({
      path: z.literal('preview.png'),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      mimeType: z.literal('image/png'),
      byteLength: z.number().int().min(1).max(5_000_000)
    })
    .optional()
})

export function formatZodError(prefix: string, error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : 'root'}: ${issue.message}`)
    .join('; ')
  return new Error(`${prefix}: ${details}`)
}
