/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { buildGs1, gs1CheckDigit, gs1Template, normalizeGs1Value } from './gs1'
import { createObject } from './template/document'
import { barcodeSvg } from './render/barcode'

describe('GS1 builder', () => {
  it('calculates and validates GTIN, SSCC and GLN check digits', () => {
    expect(gs1CheckDigit('0950110153000')).toBe('3')
    expect(normalizeGs1Value('01', '0950110153000')).toBe('09501101530003')
    expect(normalizeGs1Value('00', '10614141000000000')).toHaveLength(18)
    expect(normalizeGs1Value('410', '061414100000')).toHaveLength(13)
    expect(() => normalizeGs1Value('01', '09501101530004')).toThrow(/check digit/)
  })

  it('validates dates, character sets, lengths and measurement AIs', () => {
    expect(normalizeGs1Value('17', '240229')).toBe('240229')
    expect(normalizeGs1Value('3103', '001234')).toBe('001234')
    expect(() => normalizeGs1Value('17', '230229')).toThrow(/date/)
    expect(() => normalizeGs1Value('37', '12A')).toThrow(/digits/)
    expect(() => normalizeGs1Value('10', '')).toThrow(/1–20/)
  })

  it('adds a group separator after variable-length data and produces HRI', () => {
    expect(
      buildGs1([
        { ai: '01', value: '09501101530003' },
        { ai: '10', value: 'LOT1' },
        { ai: '21', value: 'SER1' }
      ])
    ).toMatchObject({
      humanReadable: '(01)09501101530003(10)LOT1(21)SER1',
      bwipText: '(01)09501101530003(10)LOT1(21)SER1',
      encoded: `010950110153000310LOT1\u001d21SER1`
    })
  })

  it('renders all three dedicated GS1 carriers', () => {
    const data = '(01)09501101530003(17)251231(21)SER1'
    const linear = createObject('barcode', 0, 0)
    if (linear.kind !== 'barcode') throw new Error('Expected barcode')
    linear.symbology = 'gs1-128'
    linear.data = data
    expect(barcodeSvg(linear)).toContain('<svg')
    for (const symbology of ['gs1datamatrix', 'gs1qrcode'] as const) {
      const matrix = createObject('qrcode', 0, 0)
      if (matrix.kind !== 'qrcode') throw new Error('Expected matrix code')
      matrix.symbology = symbology
      matrix.data = data
      expect(barcodeSvg(matrix)).toContain('<svg')
    }
  })

  it('preserves variable templates for print-time validation', () => {
    expect(
      gs1Template([
        { ai: '01', value: '{gtin}' },
        { ai: '21', value: '{serial}' }
      ])
    ).toBe('(01){gtin}(21){serial}')
  })
})
