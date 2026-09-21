/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import type { EditorBreadcrumb } from '@shared/diagnostics'
import { sanitizeBreadcrumb } from './breadcrumbs'
import { redactForDiagnostics } from './redaction'
import { BARCODE_SYMBOLOGY_VALUES } from '@shared/template/symbologies'
import { IPC_ERROR_CODES } from '@shared/ipc/contract'
import { objectSchema } from '@shared/template/schema'

/**
 * The matrix symbologies as the file format itself defines them, read out of
 * the parser rather than retyped, so this test fails when the format gains one
 * and the sanitiser's allowlist has not caught up.
 */
function schemaMatrixSymbologies(): string[] {
  const variants = (objectSchema as unknown as { options: unknown[] }).options
  for (const variant of variants) {
    const shape = (variant as { shape: Record<string, unknown> }).shape
    if ((shape['kind'] as { value?: string }).value !== 'qrcode') continue
    return (shape['symbology'] as { unwrap: () => { options: string[] } }).unwrap().options
  }
  throw new Error('The object schema no longer has a qrcode variant.')
}

const every: EditorBreadcrumb[] = [
  { event: 'editor.objects-added', kind: 'barcode', count: 1 },
  { event: 'editor.objects-removed', kind: 'text', count: 2 },
  { event: 'editor.symbology-changed', from: 'code128', to: 'ean13' },
  { event: 'editor.barcode-failed', symbology: 'ean13', code: 'ean13badLength' },
  { event: 'editor.preflight', errors: 2, warnings: 1 },
  { event: 'editor.variable-created', kind: 'prompt', count: 1 },
  { event: 'editor.variable-deleted', kind: 'counter', count: 1 },
  { event: 'editor.variable-kind-changed', from: 'fixed', to: 'field' },
  { event: 'editor.document-opened', objects: 6, variables: 2 },
  { event: 'editor.document-saved', objects: 6, variables: 2 },
  { event: 'editor.export-failed', format: 'pdf', code: 'io-error' }
]

describe('breadcrumb boundary', () => {
  it('accepts every breadcrumb the editor can record', () => {
    for (const breadcrumb of every) expect(sanitizeBreadcrumb(breadcrumb)).toEqual(breadcrumb)
  })

  it('copies only the allowlisted fields, never what the renderer added to them', () => {
    expect(
      sanitizeBreadcrumb({
        event: 'editor.objects-added',
        kind: 'barcode',
        count: 1,
        name: 'Customer address',
        text: 'Acme Coffee Roasters Ltd',
        data: '9501101530003',
        path: 'C:\\Users\\albert\\labels\\pallet.bar'
      })
    ).toEqual({ event: 'editor.objects-added', kind: 'barcode', count: 1 })
  })

  it('rejects a payload that carries a value where a code belongs', () => {
    // The encoder's full message embeds the operator's own data, so only the
    // failure name may travel. Anything with a space or a colon is not a code.
    expect(
      sanitizeBreadcrumb({
        event: 'editor.barcode-failed',
        symbology: 'ean13',
        code: 'bwipp.ean13badLength: EAN-13 must be 12 or 13 digits, got 9501101530003'
      })
    ).toBeNull()
    expect(
      sanitizeBreadcrumb({ event: 'editor.export-failed', format: 'pdf', code: 'C:/labels/a.bar' })
    ).toBeNull()
  })

  it('rejects unknown events, kinds, symbologies and counts', () => {
    expect(sanitizeBreadcrumb({ event: 'editor.text-typed', text: 'secret' })).toBeNull()
    expect(
      sanitizeBreadcrumb({ event: 'editor.objects-added', kind: 'Customer address', count: 1 })
    ).toBeNull()
    expect(
      sanitizeBreadcrumb({
        event: 'editor.symbology-changed',
        from: 'code128',
        to: '9501101530003'
      })
    ).toBeNull()
    expect(sanitizeBreadcrumb({ event: 'editor.preflight', errors: 1.5, warnings: -1 })).toBeNull()
    expect(sanitizeBreadcrumb(null)).toBeNull()
    expect(sanitizeBreadcrumb('editor.objects-added')).toBeNull()
  })

  it('passes redaction unchanged, because there is nothing left to redact', () => {
    for (const breadcrumb of every) {
      const { event, ...context } = breadcrumb
      const redacted = redactForDiagnostics({ event, context }, 'albert')
      expect(redacted).toEqual({ event, context })
      expect(JSON.stringify(redacted)).not.toContain('REDACTED')
    }
  })

  it('accepts every symbology the file format can actually hold', () => {
    // A symbology the allowlist has not caught up with would silently lose the
    // breadcrumb, so both lists come from their source of truth, not from here.
    for (const symbology of [...BARCODE_SYMBOLOGY_VALUES, ...schemaMatrixSymbologies()])
      expect(
        sanitizeBreadcrumb({ event: 'editor.barcode-failed', symbology, code: 'badLength' })
      ).toEqual({ event: 'editor.barcode-failed', symbology, code: 'badLength' })
  })

  it('accepts every result-envelope code an export can fail with', () => {
    for (const code of IPC_ERROR_CODES)
      expect(sanitizeBreadcrumb({ event: 'editor.export-failed', format: 'png', code })).toEqual({
        event: 'editor.export-failed',
        format: 'png',
        code
      })
  })

  it('rejects codes shaped like operator data', () => {
    // A GTIN or serial leads with a digit; a lot code or file name carries a
    // separator. None of them is an encoder failure name.
    for (const code of ['9501101530003', 'LOT-2026-0042-ACME', 'SKU-778812', '000042'])
      expect(
        sanitizeBreadcrumb({ event: 'editor.barcode-failed', symbology: 'ean13', code })
      ).toBeNull()
    expect(
      sanitizeBreadcrumb({ event: 'editor.export-failed', format: 'pdf', code: 'pallet' })
    ).toBeNull()
  })
})
