/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { ObjectKind, VariableKind } from './template/types'

export type DiagnosticLevel = 'error' | 'warn' | 'info' | 'debug'

export interface DiagnosticLogEntry {
  timestamp: string
  level: DiagnosticLevel
  event: string
  message?: string
  context?: unknown
  stack?: string
}

export interface DiagnosticBundleOptions {
  description: string
  includeCurrentDocument: boolean
  currentDocumentPath: string | null
  includeLastPrintData: boolean
  lastPrintData: unknown | null
}

export interface DiagnosticBundleResult {
  path: string
  fileName: string
  entries: string[]
}

export interface CrashNotice {
  id: string
  path: string
  createdAt: string
}

/**
 * A renderer-side editor event worth keeping in the log.
 *
 * The union is the privacy boundary expressed as a type: every member carries
 * counts, enumerated kinds and error codes only. There is deliberately no field
 * an object name, a text string, a barcode's data, a variable value or a file
 * path could be put in, and the main process rebuilds each breadcrumb from
 * these fields alone before logging it.
 */
export type EditorBreadcrumb =
  | { event: 'editor.objects-added'; kind: ObjectKind; count: number }
  | { event: 'editor.objects-removed'; kind: ObjectKind; count: number }
  | { event: 'editor.symbology-changed'; from: string; to: string }
  /** `code` is the bwip-js failure name, such as `ean13badLength`. */
  | { event: 'editor.barcode-failed'; symbology: string; code: string }
  | { event: 'editor.preflight'; errors: number; warnings: number }
  | { event: 'editor.variable-created'; kind: VariableKind; count: number }
  | { event: 'editor.variable-deleted'; kind: VariableKind; count: number }
  | { event: 'editor.variable-kind-changed'; from: VariableKind; to: VariableKind }
  | { event: 'editor.document-opened'; objects: number; variables: number }
  | { event: 'editor.document-saved'; objects: number; variables: number }
  | { event: 'editor.export-failed'; format: 'pdf' | 'png'; code: string }
