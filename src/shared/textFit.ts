/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { TextObject, VerticalAlign } from './template/types'
import { ptToMm } from './units'

export interface TextFitResult {
  fontSizePt: number
  lines: string[]
  overflow: boolean
  atMinimum: boolean
  reachedMinimum: boolean
  widthMm: number
  heightMm: number
}

/** The font whose advance widths a measurer has to reproduce. */
export interface TextFontSpec {
  fontFamily: string
  fontWeight: TextObject['fontWeight']
  fontStyle: TextObject['fontStyle']
}

/**
 * Width of `text` in millimetres at `fontSizePt`. `shared/` cannot reach a
 * canvas, so the renderer injects a real `measureText` implementation and every
 * other caller keeps the font-independent approximation below.
 */
export type TextMeasurer = (text: string, fontSizePt: number, font: TextFontSpec) => number

function glyphFactor(character: string): number {
  if (/\s/.test(character)) return 0.28
  if (/[ilI1|.,'`]/.test(character)) return 0.3
  if (/[MW@%#]/.test(character)) return 0.85
  if (/[A-Z0-9]/.test(character)) return 0.62
  return 0.52
}

/**
 * Sums a per-glyph-class guess at the advance width. It ignores the family, the
 * weight and the style, so it disagrees with whatever the canvas actually draws;
 * it is the default for callers that have no canvas to measure with.
 */
export const estimatedTextWidthMm: TextMeasurer = (text, fontSizePt) =>
  [...text].reduce((width, character) => width + glyphFactor(character), 0) * ptToMm(fontSizePt)

/** A measurer bound to one object's font, which is all the fitting loop needs. */
type LineWidth = (text: string, fontSizePt: number) => number

function wrapLine(line: string, widthMm: number, sizePt: number, width: LineWidth): string[] {
  if (!line) return ['']
  const words = line.split(/(\s+)/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = `${current}${word}`
    if (current.trim() && width(candidate, sizePt) > widthMm) {
      lines.push(current.trimEnd())
      current = word.trimStart()
      if (width(current, sizePt) <= widthMm) continue
    } else {
      current = candidate
      continue
    }
    let segment = ''
    for (const character of current) {
      if (segment && width(`${segment}${character}`, sizePt) > widthMm) {
        lines.push(segment)
        segment = character
      } else segment += character
    }
    current = segment
  }
  lines.push(current.trimEnd())
  return lines
}

function linesFor(
  text: string,
  widthMm: number,
  sizePt: number,
  wrap: boolean,
  width: LineWidth
): string[] {
  return text
    .split('\n')
    .flatMap((line) => (wrap ? wrapLine(line, Math.max(widthMm, 0.001), sizePt, width) : [line]))
}

function blockSize(
  lines: string[],
  sizePt: number,
  lineHeight: number,
  width: LineWidth
): { width: number; height: number } {
  return {
    width: Math.max(0, ...lines.map((line) => width(line, sizePt))),
    height: lines.length * ptToMm(sizePt) * lineHeight
  }
}

export function fitText(
  object: TextObject,
  measure: TextMeasurer = estimatedTextWidthMm
): TextFitResult {
  const minimum = Math.min(object.fontSizePt, object.minFontSizePt)
  let size = object.fontSizePt
  const wraps = object.fitMode === 'wrap' || object.fitMode === 'shrink'
  const font: TextFontSpec = {
    fontFamily: object.fontFamily,
    fontWeight: object.fontWeight,
    fontStyle: object.fontStyle
  }
  const width: LineWidth = (text, sizePt) => measure(text, sizePt, font)
  const fits = (candidate: number): { lines: string[]; width: number; height: number } => {
    const lines = linesFor(object.text, object.widthMm, candidate, wraps, width)
    return { lines, ...blockSize(lines, candidate, object.lineHeight, width) }
  }
  let result = fits(size)
  if (object.fitMode === 'fit-width' && result.width > object.widthMm) {
    size = Math.max(minimum, size * (object.widthMm / result.width))
    result = fits(size)
  } else if (object.fitMode === 'shrink') {
    while (
      size > minimum &&
      (result.width > object.widthMm ||
        result.height > object.heightMm ||
        result.lines.length > object.maxLines)
    ) {
      size = Math.max(minimum, Math.round((size - 0.25) * 100) / 100)
      result = fits(size)
    }
  }
  // Every fitted line is kept: `maxLines` is a constraint on how far `shrink`
  // has to shrink, never a licence to drop text from the printed label.
  const overflow =
    (object.fitMode === 'shrink' && result.lines.length > object.maxLines) ||
    result.width > object.widthMm + 0.001 ||
    result.height > object.heightMm + 0.001
  return {
    fontSizePt: size,
    lines: result.lines,
    overflow,
    // Only the modes that shrink can be "at the minimum"; `wrap` and `none`
    // keep the authored size whatever the minimum says.
    atMinimum:
      (object.fitMode === 'shrink' || object.fitMode === 'fit-width') &&
      size <= minimum + 0.001 &&
      overflow,
    reachedMinimum:
      (object.fitMode === 'shrink' || object.fitMode === 'fit-width') && size <= minimum + 0.001,
    widthMm: result.width,
    heightMm: result.height
  }
}

/**
 * Distance from the top of the box to the top of the fitted text block, which
 * is where the print SVG anchors its first line. The offset is a ratio of the
 * two heights, so it holds in whichever unit the caller measures them in.
 * Content taller than the box gives a negative offset for `middle` and
 * `bottom`: the block stays anchored to the middle or the bottom edge and
 * spills upwards, as it did before wrapping kept every line.
 */
export function verticalOffset(
  verticalAlign: VerticalAlign,
  boxHeight: number,
  contentHeight: number
): number {
  const slack = boxHeight - contentHeight
  return verticalAlign === 'middle' ? slack / 2 : verticalAlign === 'bottom' ? slack : 0
}

/**
 * The same anchor measured from the centre of the box, which is the origin
 * Fabric gives a canvas textbox.
 */
export function textTopOffset(
  verticalAlign: VerticalAlign,
  boxHeight: number,
  contentHeight: number
): number {
  return -boxHeight / 2 + verticalOffset(verticalAlign, boxHeight, contentHeight)
}
