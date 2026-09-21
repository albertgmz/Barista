/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { redactForDiagnostics } from './redaction'

describe('diagnostic redaction', () => {
  it('removes passwords, credentialed connection strings, PINs, values and user paths', () => {
    const redacted = JSON.stringify(
      redactForDiagnostics(
        {
          password: 'coffee-secret',
          connectionString: 'postgres://albert:hunter2@localhost/barista',
          adminPin: '7391',
          adminPinHash: 'hash-value',
          file: 'C:\\Users\\albert\\Documents\\private.xlsx',
          fields: { customer: 'Private Co' },
          serialNumber: '000042',
          message: 'password=another-secret api_token=abcdefgh1234',
          tokenName: 'shop-floor',
          apiToken: 'token-value-9876'
        },
        'albert'
      )
    )
    for (const secret of [
      'coffee-secret',
      'hunter2',
      '7391',
      'hash-value',
      'Private Co',
      '000042',
      'another-secret',
      'abcdefgh1234',
      'token-value-9876',
      'C:\\\\Users\\\\albert'
    ])
      expect(redacted).not.toContain(secret)
    expect(redacted).toContain('%USER%')
    expect(redacted).toContain('shop-floor')
    expect(redacted).toContain('…9876')
  })

  it('redacts errors and circular structures safely', () => {
    const value: Record<string, unknown> = { error: new Error('password=secret') }
    value['self'] = value
    const redacted = JSON.stringify(redactForDiagnostics(value, 'albert'))
    expect(redacted).not.toContain('password=secret')
    expect(redacted).toContain('[Circular]')
  })
})
