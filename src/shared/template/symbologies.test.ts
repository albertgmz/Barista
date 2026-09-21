/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import {
  BARCODE_SYMBOLOGIES,
  BARCODE_SYMBOLOGY_VALUES,
  encoderMessage,
  isGs1Symbology,
  symbologyDataRule,
  symbologyDescriptor
} from './symbologies'
import { objectSchema } from './schema'
import { createObject } from './document'

describe('barcode symbology descriptors', () => {
  it('keeps the persisted values of the published file format', () => {
    expect(BARCODE_SYMBOLOGY_VALUES).toEqual([
      'code128',
      'code39',
      'code93',
      'codabar',
      'ean13',
      'ean8',
      'upca',
      'upce',
      'itf14',
      'interleaved2of5',
      'gs1-128'
    ])
  })

  it('describes every symbology with a label, a rule and an example', () => {
    for (const descriptor of BARCODE_SYMBOLOGIES) {
      expect(descriptor.label).not.toBe('')
      expect(descriptor.rule).not.toBe('')
      expect(descriptor.example).not.toBe('')
      expect(symbologyDescriptor(descriptor.value)).toBe(descriptor)
    }
  })

  it('accepts every documented value in the document schema', () => {
    const object = createObject('barcode', 0, 0)
    for (const value of BARCODE_SYMBOLOGY_VALUES)
      expect(objectSchema.safeParse({ ...object, symbology: value }).success).toBe(true)
    expect(objectSchema.safeParse({ ...object, symbology: 'code12' }).success).toBe(false)
  })

  it('states the data rule in plain language', () => {
    expect(symbologyDataRule('gs1-128')).toBe(
      'GS1-128 data must be element strings starting with an application identifier in parentheses, for example (01)09501101530003'
    )
    expect(symbologyDataRule('qrcode')).toBeNull()
  })

  it('drops the encoder prefix from a library message', () => {
    expect(encoderMessage('bwipp.ean13badLength#6878: EAN-13 must be 12 or 13 digits')).toBe(
      'EAN-13 must be 12 or 13 digits'
    )
    expect(encoderMessage('bwipp.unknownEncoder: unknown encoder name: codabar')).toBe(
      'unknown encoder name: codabar'
    )
    expect(encoderMessage('bwip-js: invalid color: black')).toBe('invalid color: black')
    expect(encoderMessage('Missing image: Logo')).toBe('Missing image: Logo')
  })

  it('recognises the GS1 carriers, including the matrix ones', () => {
    expect(isGs1Symbology('gs1-128')).toBe(true)
    expect(isGs1Symbology('gs1datamatrix')).toBe(true)
    expect(isGs1Symbology('gs1qrcode')).toBe(true)
    expect(isGs1Symbology('code128')).toBe(false)
    expect(isGs1Symbology(undefined)).toBe(false)
  })
})
