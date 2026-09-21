/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { FontFileMimeType, LabelDocument } from '../template/types'

export const BAR_FORMAT_NAME = 'Barista Label' as const
export const BAR_FORMAT_VERSION = 2

export interface BarPreviewEntry {
  path: 'preview.png'
  sha256: string
  mimeType: 'image/png'
  byteLength: number
}

export interface BarAssetEntry {
  id: string
  path: string
  sha256: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/svg+xml'
  byteLength: number
}

export interface BarFontEntry {
  id: string
  path: string
  sha256: string
  mimeType: FontFileMimeType
  byteLength: number
}

export interface BarManifest {
  format: typeof BAR_FORMAT_NAME
  formatVersion: number
  appVersion: string
  createdAt: string
  modifiedAt: string
  assets: BarAssetEntry[]
  fonts?: BarFontEntry[]
  preview?: BarPreviewEntry
}

export interface OpenedLabel {
  document: LabelDocument
  readOnly: boolean
  warning?: string
}

export interface RecoveryRecord {
  document: LabelDocument
  originalPath: string | null
  savedAt: string
}
