/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { createDocument, createObject } from '../template/document'
import { BUILT_IN_STOCK_PRESETS } from '../template/stockPresets'
import { fitText, verticalOffset } from '../textFit'
import { ptToMm } from '../units'
import { objectSvg, pageSvg, stockShapeSvg } from './svg'

const textObject = (properties: Record<string, unknown>) => {
  const object = createObject('text', 2, 2)
  if (object.kind !== 'text') throw new Error('Expected text')
  Object.assign(object, properties)
  return object
}

const tspans = (svg: string): string[] =>
  [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1] ?? '')

describe('stock rendering', () => {
  it('uses the physical shape as the print clip', () => {
    const document = createDocument({
      ...createDocument().template.stock,
      widthMm: 40,
      heightMm: 25,
      shape: 'ellipse'
    })
    expect(stockShapeSvg(document.template.stock)).toContain('<ellipse')
    expect(pageSvg(document)).toContain('<clipPath id="label"><ellipse')
  })

  it('lays a sheet design out at every documented stock position', () => {
    const preset = BUILT_IN_STOCK_PRESETS.find((item) => item.id === 'avery-5160')!
    const svg = pageSvg(createDocument(preset.stock))
    expect(svg).toContain('width="215.89999999999998mm"')
    expect(svg.match(/fill="#ffffff"/g)).toHaveLength(30)
  })

  it('prints every wrapped line instead of stopping at the maximum line count', () => {
    const document = createDocument()
    const text = textObject({
      text: 'Chilled almond milk latte with two extra shots and vanilla syrup',
      widthMm: 20,
      heightMm: 10,
      fitMode: 'wrap',
      maxLines: 3
    })
    document.template.design.objects.push(text)
    const printed = tspans(pageSvg(document))
    expect(printed.length).toBeGreaterThan(3)
    expect(printed.join(' ').split(/\s+/).filter(Boolean)).toEqual(text.text.split(' '))
  })

  it('anchors the first printed line by the vertical alignment of the box', () => {
    const document = createDocument()
    for (const verticalAlign of ['top', 'middle', 'bottom'] as const) {
      const text = textObject({ text: 'One line', widthMm: 30, heightMm: 30, verticalAlign })
      const fit = fitText(text)
      const y = Number(/<tspan x="[^"]*" y="([^"]*)"/.exec(objectSvg(text, document))?.[1])
      expect(y - ptToMm(fit.fontSizePt) * 0.82).toBeCloseTo(
        verticalOffset(verticalAlign, text.heightMm, fit.heightMm),
        10
      )
    }
  })

  it('uses shared fitted lines and size in print SVG', () => {
    const document = createDocument()
    const text = textObject({
      text: 'A long line that needs fitting',
      widthMm: 20,
      heightMm: 10,
      fontSizePt: 18,
      minFontSizePt: 6,
      maxLines: 3,
      fitMode: 'shrink'
    })
    document.template.design.objects.push(text)
    const svg = pageSvg(document)
    expect(svg).toContain('data-fit="shrink"')
    expect(svg).toContain('data-overflow="false"')
    expect(svg).not.toContain(`font-size="${(18 * 25.4) / 72}"`)
  })

  it('carries the box a wrapping mode needs to be re-wrapped against real metrics', () => {
    // The print window measures the font this process cannot, so the source
    // text, the box and the anchor all have to survive into the SVG.
    const document = createDocument()
    const text = textObject({
      text: 'Chilled almond milk latte',
      widthMm: 20,
      heightMm: 12,
      verticalAlign: 'bottom',
      fitMode: 'wrap'
    })
    const svg = objectSvg(text, document)
    expect(svg).toContain('data-fit="wrap"')
    expect(svg).toContain('data-width="20"')
    expect(svg).toContain('data-height="12"')
    expect(svg).toContain('data-valign="bottom"')
    expect(svg).toContain('data-text="Chilled almond milk latte"')
  })
})
