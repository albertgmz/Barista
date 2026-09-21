/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { createObject } from './template/document'
import {
  estimatedTextWidthMm,
  fitText,
  textTopOffset,
  verticalOffset,
  type TextFontSpec,
  type TextMeasurer
} from './textFit'
import { ptToMm } from './units'

const textObject = () => {
  const object = createObject('text', 0, 0)
  if (object.kind !== 'text') throw new Error('Expected text')
  return object
}

// Wrapping may break a word that is wider than the box, so content is compared
// glyph by glyph rather than line by line.
const glyphs = (text: string): string => text.replace(/\s+/g, '')

describe('text fitting', () => {
  it('shrinks to fit both dimensions without passing the minimum', () => {
    const object = textObject()
    Object.assign(object, {
      text: 'A long equipment name that must shrink',
      widthMm: 24,
      heightMm: 8,
      fontSizePt: 18,
      minFontSizePt: 6,
      maxLines: 2,
      fitMode: 'shrink'
    })
    const result = fitText(object)
    expect(result.fontSizePt).toBeLessThan(18)
    expect(result.fontSizePt).toBeGreaterThanOrEqual(6)
    expect(result.lines.length).toBeLessThanOrEqual(2)
    expect(result.overflow).toBe(false)
  })

  it('reports overflow when minimum size still does not fit', () => {
    const object = textObject()
    Object.assign(object, {
      text: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      widthMm: 5,
      heightMm: 2,
      fontSizePt: 16,
      minFontSizePt: 10,
      maxLines: 1,
      fitMode: 'shrink'
    })
    const result = fitText(object)
    expect(result).toMatchObject({
      fontSizePt: 10,
      overflow: true,
      atMinimum: true,
      reachedMinimum: true
    })
    expect(glyphs(result.lines.join(''))).toBe(glyphs(object.text))
  })

  it('fits width only, and keeps every wrapped line past the maximum line count', () => {
    const width = textObject()
    Object.assign(width, { text: 'Wide text', widthMm: 8, fitMode: 'fit-width' })
    expect(fitText(width).fontSizePt).toBeLessThan(width.fontSizePt)
    const wrap = textObject()
    Object.assign(wrap, {
      text: 'one two three four five',
      widthMm: 10,
      heightMm: 20,
      fitMode: 'wrap',
      maxLines: 2
    })
    const fitted = fitText(wrap)
    expect(fitted.lines.length).toBeGreaterThan(wrap.maxLines)
    expect(glyphs(fitted.lines.join(''))).toBe(glyphs(wrap.text))
  })

  it('never drops a wrapped line from the printed output', () => {
    const object = textObject()
    Object.assign(object, {
      text: 'Chilled almond milk latte with two extra shots and vanilla syrup',
      widthMm: 30,
      heightMm: 6,
      fitMode: 'wrap',
      maxLines: 3
    })
    const fitted = fitText(object)
    expect(fitted.lines.length).toBeGreaterThan(object.maxLines)
    expect(glyphs(fitted.lines.join(''))).toBe(glyphs(object.text))
    expect(fitted.fontSizePt).toBe(object.fontSizePt)
    expect(fitted.overflow).toBe(true)
  })

  it('reports no overflow for a wrapped box tall enough for every line', () => {
    const object = textObject()
    Object.assign(object, {
      text: 'Chilled almond milk latte with two extra shots and vanilla syrup',
      widthMm: 30,
      heightMm: 40,
      fitMode: 'wrap',
      maxLines: 1
    })
    expect(fitText(object).overflow).toBe(false)
  })

  it('wraps new text objects by default', () => {
    expect(textObject().fitMode).toBe('wrap')
  })

  it('wraps where the injected measurer says, not where the approximation guesses', () => {
    const object = textObject()
    Object.assign(object, {
      text: 'MMMM WWWW MMMM WWWW',
      fontFamily: 'JetBrains Mono',
      widthMm: 30,
      heightMm: 30,
      fontSizePt: 10,
      fitMode: 'wrap'
    })
    // What a monospaced face really does: one advance for every glyph. The
    // approximation scores M and W at 0.85 and so breaks a line early.
    const seen: TextFontSpec[] = []
    const monospace: TextMeasurer = (text, fontSizePt, font) => {
      seen.push(font)
      return [...text].length * 0.6 * ptToMm(fontSizePt)
    }
    expect(fitText(object).lines).toEqual(['MMMM WWWW', 'MMMM WWWW'])
    expect(fitText(object, monospace).lines).toEqual(['MMMM WWWW MMMM', 'WWWW'])
    expect(seen[0]).toEqual({
      fontFamily: 'JetBrains Mono',
      fontWeight: 'normal',
      fontStyle: 'normal'
    })
  })

  it('keeps the approximation unchanged for callers that inject nothing', () => {
    // 0.28 for a space, 0.3 for the narrow glyphs (`1` among them, ahead of
    // the digit rule), 0.85 for M and W, 0.62 for any other capital or digit
    // and 0.52 otherwise, scaled by the point size: 72 pt is 25.4 mm.
    const font: TextFontSpec = {
      fontFamily: 'JetBrains Mono',
      fontWeight: 'bold',
      fontStyle: 'italic'
    }
    expect(estimatedTextWidthMm('MW', 72, font)).toBeCloseTo(1.7 * 25.4, 10)
    expect(estimatedTextWidthMm('Ai1 .', 72, font)).toBeCloseTo(1.8 * 25.4, 10)
    // The approximation ignores the font, which is the defect the seam exists
    // to let the renderer fix; every other caller must still see this number.
    expect(estimatedTextWidthMm('Ai1 .', 72, { ...font, fontFamily: 'Inter' })).toBeCloseTo(
      1.8 * 25.4,
      10
    )
    const object = textObject()
    Object.assign(object, {
      text: 'Chilled almond milk latte',
      widthMm: 20,
      heightMm: 30,
      fontSizePt: 10,
      fitMode: 'wrap'
    })
    expect(fitText(object).lines).toEqual(['Chilled', 'almond milk', 'latte'])
  })

  it('anchors the text block the same way for the canvas and for print', () => {
    // `verticalOffset` measures from the top of the box, which is what the print
    // SVG anchors to; `textTopOffset` measures from the centre of the box, which
    // is the origin Fabric hands the canvas textbox.
    expect(verticalOffset('top', 30, 10)).toBe(0)
    expect(verticalOffset('middle', 30, 10)).toBe(10)
    expect(verticalOffset('bottom', 30, 10)).toBe(20)
    expect(textTopOffset('top', 30, 10)).toBe(-15)
    expect(textTopOffset('middle', 30, 10)).toBe(-5)
    expect(textTopOffset('bottom', 30, 10)).toBe(5)
  })

  it('keeps a block that outgrows its box anchored to its own edge', () => {
    expect(verticalOffset('top', 10, 30)).toBe(0)
    expect(verticalOffset('middle', 10, 30)).toBe(-10)
    expect(verticalOffset('bottom', 10, 30)).toBe(-20)
  })

  it('reports the minimum only for the modes that shrink', () => {
    const wrap = textObject()
    Object.assign(wrap, {
      text: 'Chilled almond milk latte with two extra shots and vanilla syrup',
      widthMm: 30,
      heightMm: 6,
      fitMode: 'wrap',
      minFontSizePt: 12
    })
    expect(fitText(wrap)).toMatchObject({ overflow: true, atMinimum: false })
    expect(fitText({ ...wrap, fitMode: 'shrink' })).toMatchObject({
      overflow: true,
      atMinimum: true
    })
  })

  it('reflows into more lines as the box narrows without changing the point size', () => {
    const object = textObject()
    Object.assign(object, {
      text: 'one two three four five six',
      widthMm: 40,
      heightMm: 30,
      maxLines: 12
    })
    const wide = fitText(object)
    object.widthMm = 14
    const narrow = fitText(object)
    expect(narrow.lines.length).toBeGreaterThan(wide.lines.length)
    expect(narrow.fontSizePt).toBe(wide.fontSizePt)
    expect(narrow.fontSizePt).toBe(object.fontSizePt)
  })
})
