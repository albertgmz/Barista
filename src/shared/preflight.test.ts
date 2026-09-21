/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { createDocument, createObject } from './template/document'
import { batchPreflight, preflight } from './preflight'
import type { TextMeasurer } from './textFit'
import { ptToMm } from './units'

describe('preflight', () => {
  it('reports geometry, print quality, visibility and variable issues with object ids', () => {
    const document = createDocument()
    document.template.stock = { ...document.template.stock, widthMm: 60, heightMm: 35, dpi: 203 }
    const text = createObject('text', 58, 1)
    if (text.kind !== 'text') throw new Error('text')
    text.text = '{missing}'
    text.fontSizePt = 5
    text.widthMm = 10
    const barcode = createObject('barcode', 5, 5)
    if (barcode.kind !== 'barcode') throw new Error('barcode')
    barcode.data = ''
    barcode.moduleWidthMm = 0.2
    barcode.quietZoneMm = 0.5
    const cover = createObject('rect', 6, 6)
    const hidden = { ...createObject('ellipse', 2, 2), visible: false }
    document.template.design.objects = [text, barcode, cover, hidden]
    document.template.variables.push({ id: 'unused', name: 'unused', kind: 'fixed', value: 'x' })

    const result = preflight(document, { installedFonts: ['Arial'] })
    const codes = result.issues.map((issue) => issue.code)
    expect(codes).toEqual(
      expect.arrayContaining([
        'object.outside-stock',
        'text.too-small',
        'barcode.invalid',
        'barcode.module-dots',
        'barcode.quiet-zone',
        'barcode.overlap',
        'variable.undefined',
        'variable.unused',
        'font.missing',
        'object.hidden'
      ])
    )
    expect(result.errors).toBeGreaterThan(0)
    expect(result.issues.find((issue) => issue.code === 'font.missing')?.message).toContain(
      `${text.name}`
    )
    expect(result.issues.find((issue) => issue.code === 'font.missing')?.message).toContain(
      'substitute Inter'
    )
    expect(result.issues.find((issue) => issue.code === 'text.too-small')?.objectId).toBe(text.id)
  })

  it('reports low-resolution raster images and fit overflow at the minimum', () => {
    const document = createDocument()
    const text = createObject('text', 2, 2)
    if (text.kind !== 'text') throw new Error('text')
    Object.assign(text, {
      text: 'This value cannot fit',
      widthMm: 4,
      heightMm: 2,
      fontSizePt: 16,
      minFontSizePt: 10,
      fitMode: 'shrink'
    })
    const image = createObject('image', 10, 10)
    if (image.kind !== 'image') throw new Error('image')
    image.assetId = 'tiny'
    image.widthMm = 25.4
    image.heightMm = 25.4
    document.template.design.objects = [text, image]
    document.template.assets = [
      { id: 'tiny', fileName: 'tiny.png', mimeType: 'image/png', byteLength: 24 }
    ]
    // PNG signature + IHDR length/type + 10 x 10 dimensions; only the header is needed.
    document.assetData.tiny = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAK'

    const codes = preflight(document).issues.map((issue) => issue.code)
    expect(codes).toContain('text.fit-minimum')
    expect(codes).toContain('image.low-resolution')
  })

  it('reports a wrapped box by its height rather than its line count', () => {
    const wrapped = (heightMm: number): readonly string[] => {
      const document = createDocument()
      const text = createObject('text', 2, 2)
      if (text.kind !== 'text') throw new Error('text')
      Object.assign(text, {
        text: 'Chilled almond milk latte with two extra shots and vanilla syrup',
        widthMm: 30,
        heightMm,
        fitMode: 'wrap',
        maxLines: 3
      })
      document.template.design.objects = [text]
      return preflight(document).issues.map((issue) => issue.code)
    }
    expect(wrapped(6)).toContain('text.overflow')
    expect(wrapped(30)).not.toContain('text.overflow')
  })

  it('measures text with the injected measurer, so the report agrees with the canvas', () => {
    const document = createDocument()
    const text = createObject('text', 2, 2)
    if (text.kind !== 'text') throw new Error('text')
    Object.assign(text, {
      text: 'MMMM WWWW MMMM',
      fontFamily: 'JetBrains Mono',
      widthMm: 30,
      heightMm: 5,
      fontSizePt: 10,
      fitMode: 'wrap'
    })
    document.template.design.objects = [text]
    const codes = (measureText?: TextMeasurer): readonly string[] =>
      preflight(document, { measureText }).issues.map((issue) => issue.code)
    // One advance per glyph, as a monospaced face really behaves: the line fits
    // on one row, while the approximation scores M and W at 0.85 em, wraps it
    // in two and calls the box overflowed.
    const monospace: TextMeasurer = (value, fontSizePt) =>
      [...value].length * 0.6 * ptToMm(fontSizePt)
    expect(codes()).toContain('text.overflow')
    expect(codes(monospace)).not.toContain('text.overflow')
  })

  it('summarizes record-specific invalid barcodes and text overflow', () => {
    const document = createDocument()
    const barcode = createObject('barcode', 2, 2)
    if (barcode.kind !== 'barcode') throw new Error('barcode')
    barcode.symbology = 'ean13'
    barcode.data = '{code}'
    barcode.quietZoneMm = 3
    const text = createObject('text', 2, 20)
    if (text.kind !== 'text') throw new Error('text')
    Object.assign(text, {
      text: '{name}',
      widthMm: 8,
      heightMm: 5,
      fitMode: 'shrink',
      minFontSizePt: 10
    })
    document.template.design.objects = [barcode, text]
    document.template.variables = [
      { id: 'code', name: 'code', kind: 'field', column: 'Code', sampleValue: '123456789012' },
      { id: 'name', name: 'name', kind: 'field', column: 'Name', sampleValue: 'Short' }
    ]
    const result = batchPreflight(document, [
      { key: 'ok', fields: { Code: '5901234123457', Name: 'OK' } },
      { key: 'bad', fields: { Code: 'x', Name: 'A name that is far too long for this box' } }
    ])

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]!.errors).toBe(0)
    expect(result.rows[1]!.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['barcode.invalid', 'text.fit-minimum'])
    )
    expect(result.rowsWithErrors).toBe(1)
  })
})
