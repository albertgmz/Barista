/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { barcodeError, barcodeSvg } from './barcode'
import { createDocument, createObject } from '../template/document'
import { BARCODE_SYMBOLOGIES } from '../template/symbologies'
import { evaluatedDocument } from '../variables'
import type { BarcodeObject } from '../template/types'

function barcode(patch: Partial<BarcodeObject> = {}): BarcodeObject {
  const object = createObject('barcode', 0, 0)
  if (object.kind !== 'barcode') throw new Error('Expected a barcode')
  return { ...object, ...patch }
}

describe('barcode rendering', () => {
  it.each(BARCODE_SYMBOLOGIES)(
    'renders $label with its documented example data',
    ({ value, example }) => {
      expect(barcodeSvg(barcode({ symbology: value, data: example }))).toContain('<svg')
    }
  )

  it('reports a library message instead of throwing for invalid data', () => {
    expect(barcodeError(barcode({ symbology: 'ean13', data: '1' }))).toMatch(/EAN-13/)
  })

  it('adds the optional check digit only where the symbology takes one', () => {
    for (const { value, example, optionalCheckDigit } of BARCODE_SYMBOLOGIES) {
      const on = barcodeSvg(barcode({ symbology: value, data: example, addCheckDigit: true }))
      const off = barcodeSvg(barcode({ symbology: value, data: example, addCheckDigit: false }))
      expect({ value, changed: on !== off }).toEqual({ value, changed: optionalCheckDigit })
    }
  })

  it('never asks ITF-14 for a second check digit, which the readable text would not show', () => {
    const data = '0123456789012'
    expect(barcodeSvg(barcode({ symbology: 'itf14', data, addCheckDigit: true }))).toBe(
      barcodeSvg(barcode({ symbology: 'itf14', data, addCheckDigit: false }))
    )
  })

  it('paints the bars and the human-readable text in the object colour', () => {
    const svg = barcodeSvg(barcode({ symbology: 'code39', data: 'CODE39', color: '#ff0000' }))
    expect(svg).toContain('stroke="#ff0000"')
    expect(svg).toContain('fill="#ff0000"')
  })

  it('translates the named colours the schema allows into hex the encoder accepts', () => {
    expect(barcodeSvg(barcode({ symbology: 'code39', data: 'CODE39', color: 'black' }))).toContain(
      'stroke="#000000"'
    )
    expect(barcodeSvg(barcode({ symbology: 'code39', data: 'CODE39', color: 'white' }))).toContain(
      'stroke="#ffffff"'
    )
  })

  it('renders data bound to a variable once the sample values are resolved', () => {
    const document = createDocument()
    document.template.variables = [{ id: 'v1', name: 'gtin', kind: 'fixed', value: '012345678912' }]
    document.template.design.objects = [barcode({ symbology: 'ean13', data: '{gtin}' })]
    const unresolved = document.template.design.objects[0]!
    expect(barcodeError(unresolved)).toMatch(/EAN-13/)
    const resolved = evaluatedDocument(document, { sample: true }).document.template.design
      .objects[0]!
    expect(barcodeError(resolved)).toBeNull()
  })
})
