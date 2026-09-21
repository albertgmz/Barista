/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * The breadcrumb trust boundary.
 *
 * Editor breadcrumbs are the only diagnostic events the renderer originates, so
 * the payload arrives from the least trusted process in the app. Nothing that
 * arrives is logged as it came: {@link sanitizeBreadcrumb} rebuilds each
 * breadcrumb field by field from an allowlist, so a renderer that sent an
 * object name, a text string, a barcode's data or a file path — whether through
 * a bug or a compromise — gets it dropped rather than redacted after the fact.
 * `redactForDiagnostics` still runs afterwards in the logger, as it does for
 * every other event.
 */
import type { EditorBreadcrumb } from '@shared/diagnostics'
import { IPC_ERROR_CODES } from '@shared/ipc/contract'
import { OBJECT_KINDS } from '@shared/template/guards'
import type { ObjectKind } from '@shared/template/types'
import type { VariableKind } from '@shared/template/types'
import { BARCODE_SYMBOLOGY_VALUES } from '@shared/template/symbologies'
import { diagnosticLog } from '.'

/**
 * The matrix symbologies of the `qrcode` object, which has no descriptor table
 * of its own. Mirrors the `symbology` union in `template/types.ts`.
 */
const MATRIX_SYMBOLOGIES: readonly string[] = ['qrcode', 'datamatrix', 'gs1datamatrix', 'gs1qrcode']

const SYMBOLOGIES: ReadonlySet<string> = new Set([
  ...BARCODE_SYMBOLOGY_VALUES,
  ...MATRIX_SYMBOLOGIES
])
const VARIABLE_KINDS: ReadonlySet<VariableKind> = new Set([
  'fixed',
  'prompt',
  'counter',
  'datetime',
  'formula',
  'field'
])

/**
 * A bwip-js failure name, such as `ean13badLength`. These are identifiers, so
 * the pattern demands one: a leading letter and nothing but letters and digits
 * after it. That excludes an encoder's full message (spaces, a colon) and also
 * the shapes operator data takes — a GTIN or serial leads with a digit, a lot
 * code or a file name carries a separator.
 *
 * This is a pattern rather than a closed set only because bwipp defines
 * hundreds of names. Every other field of every breadcrumb is a closed set.
 */
const ENCODER_CODE = /^[A-Za-z][A-Za-z0-9]{0,47}$/

const ERROR_CODES: ReadonlySet<string> = new Set(IPC_ERROR_CODES)

const isKind = (value: unknown): value is ObjectKind =>
  typeof value === 'string' && OBJECT_KINDS.includes(value as ObjectKind)

const isVariableKind = (value: unknown): value is VariableKind =>
  typeof value === 'string' && VARIABLE_KINDS.has(value as VariableKind)

const isSymbology = (value: unknown): value is string =>
  typeof value === 'string' && SYMBOLOGIES.has(value)

const isEncoderCode = (value: unknown): value is string =>
  typeof value === 'string' && ENCODER_CODE.test(value)

/** An export failure reports the result envelope's code, which is a closed set. */
const isErrorCode = (value: unknown): value is string =>
  typeof value === 'string' && ERROR_CODES.has(value)

/** Breadcrumb counts are small non-negative integers; anything else is a bug. */
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000

/**
 * Returns the breadcrumb rebuilt from its allowlisted fields, or null when the
 * payload is not one this build recognises. Unknown keys are never copied.
 */
export function sanitizeBreadcrumb(value: unknown): EditorBreadcrumb | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  switch (input['event']) {
    case 'editor.objects-added':
    case 'editor.objects-removed':
      return isKind(input['kind']) && isCount(input['count'])
        ? { event: input['event'], kind: input['kind'], count: input['count'] }
        : null
    case 'editor.symbology-changed':
      return isSymbology(input['from']) && isSymbology(input['to'])
        ? { event: 'editor.symbology-changed', from: input['from'], to: input['to'] }
        : null
    case 'editor.barcode-failed':
      return isSymbology(input['symbology']) && isEncoderCode(input['code'])
        ? { event: 'editor.barcode-failed', symbology: input['symbology'], code: input['code'] }
        : null
    case 'editor.preflight':
      return isCount(input['errors']) && isCount(input['warnings'])
        ? { event: 'editor.preflight', errors: input['errors'], warnings: input['warnings'] }
        : null
    case 'editor.variable-created':
    case 'editor.variable-deleted':
      return isVariableKind(input['kind']) && isCount(input['count'])
        ? { event: input['event'], kind: input['kind'], count: input['count'] }
        : null
    case 'editor.variable-kind-changed':
      return isVariableKind(input['from']) && isVariableKind(input['to'])
        ? { event: 'editor.variable-kind-changed', from: input['from'], to: input['to'] }
        : null
    case 'editor.document-opened':
    case 'editor.document-saved':
      return isCount(input['objects']) && isCount(input['variables'])
        ? { event: input['event'], objects: input['objects'], variables: input['variables'] }
        : null
    case 'editor.export-failed':
      return (input['format'] === 'pdf' || input['format'] === 'png') && isErrorCode(input['code'])
        ? { event: 'editor.export-failed', format: input['format'], code: input['code'] }
        : null
    default:
      return null
  }
}

/** Logs one breadcrumb at `info`, or nothing at all when it does not validate. */
export function recordBreadcrumb(value: unknown): void {
  const breadcrumb = sanitizeBreadcrumb(value)
  if (!breadcrumb) return
  const { event, ...context } = breadcrumb
  diagnosticLog.info(event, context)
}
