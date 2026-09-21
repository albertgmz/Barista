/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { createDocument, createObject } from '@shared/template/document'
import { DEFAULT_PRINT_SETTINGS } from '@shared/printSettings'
import type {
  BarcodeSymbology,
  CounterVariable,
  FieldVariable,
  LabelDocument
} from '@shared/template/types'
import { evaluatedDocument } from '@shared/variables'
import { renderLabelSvg } from './labelSvg'

const SERIAL: CounterVariable = {
  id: 'serial',
  name: 'serial',
  kind: 'counter',
  start: 1,
  step: 1,
  // EAN-13 takes 12 or 13 digits, so the counter is padded to a legal length.
  padding: 12,
  padChar: '0',
  prefix: '',
  suffix: '',
  scope: 'template',
  sharedName: '',
  format: 'numeric',
  alphabet: '0123456789',
  min: 0,
  max: 999999999999,
  overflow: 'stop',
  reset: 'never',
  failure: 'void'
}
const CODE: FieldVariable = {
  id: 'code',
  name: 'code',
  kind: 'field',
  column: 'code',
  sampleValue: 'SAMPLE-CODE'
}

function withBarcode(symbology: BarcodeSymbology, data: string): LabelDocument {
  const document = createDocument()
  const barcode = createObject('barcode', 2, 2)
  if (barcode.kind !== 'barcode') throw new Error('Expected a barcode')
  document.template.variables = [SERIAL]
  document.template.design.objects = [{ ...barcode, symbology, data }]
  return document
}

function withText(text: string): LabelDocument {
  const document = createDocument()
  const object = createObject('text', 2, 2)
  if (object.kind !== 'text') throw new Error('Expected a text object')
  document.template.variables = [CODE]
  document.template.design.objects = [{ ...object, text }]
  return document
}

describe('renderLabelSvg', () => {
  it('encodes strict symbologies from evaluated data, not from the raw placeholder', () => {
    const svg = renderLabelSvg(withBarcode('ean13', '{serial}'), DEFAULT_PRINT_SETTINGS, {
      sample: true
    })
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('{serial}')
  })

  it('encodes a GS1-128 barcode built from a variable', () => {
    // Serial 17 pads to 000000000017, the only part of this GTIN-14 that moves,
    // and 7 is its check digit.
    expect(
      renderLabelSvg(withBarcode('gs1-128', '(01)00{serial}'), DEFAULT_PRINT_SETTINGS, {
        counters: { serial: 17 }
      })
    ).toContain('<svg')
  })

  it('leaves field variables empty unless the caller asks for sample values', () => {
    const document = withText('[{code}]')
    expect(renderLabelSvg(document, DEFAULT_PRINT_SETTINGS)).toContain('[]')
    expect(renderLabelSvg(document, DEFAULT_PRINT_SETTINGS, { sample: true })).toContain(
      '[SAMPLE-CODE]'
    )
    expect(
      renderLabelSvg(document, DEFAULT_PRINT_SETTINGS, { fields: { code: 'ROW-7' } })
    ).toContain('[ROW-7]')
  })

  it('renders an already evaluated document exactly as it renders the source', () => {
    const document = withBarcode('ean13', '{serial}')
    const context = { counters: { serial: 42 } }
    expect(
      renderLabelSvg(evaluatedDocument(document, context).document, DEFAULT_PRINT_SETTINGS)
    ).toBe(renderLabelSvg(document, DEFAULT_PRINT_SETTINGS, context))
  })

  it('still reports data that cannot be encoded once the variables are resolved', () => {
    expect(() =>
      renderLabelSvg(withBarcode('ean13', 'not-a-number'), DEFAULT_PRINT_SETTINGS)
    ).toThrow()
  })
})
