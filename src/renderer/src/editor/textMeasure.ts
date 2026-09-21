/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { TextFontSpec, TextMeasurer } from '@shared/textFit'
import { mmToPx, ptToMm, pxToMm } from '@shared/units'
import { useFontStore } from '../store/fontStore'

/** The canvas and the print window both lay text out in CSS pixels. */
const CSS_DPI = 96

/**
 * Cleared rather than evicted one by one: a re-measure is cheap, and a label
 * with thousands of distinct strings is a document being typed into, not a
 * steady state worth tracking.
 */
const CACHE_LIMIT = 20_000

const widths = new Map<string, number>()
let measuring: CanvasRenderingContext2D | null = null

// A face that arrives after a string was measured would otherwise leave that
// string cached at its fallback width for the rest of the session. The store is
// the signal for the fonts this app registers, because `fontStore` awaits each
// face before adding it and adding an already-loaded face starts no load, so
// `loadingdone` never fires for them; `fonts.ready` covers the faces the
// stylesheet declares. Both are subscribed as this module loads, which is
// before anything can import the measurer and before `documentCanvas` takes its
// own font subscription — zustand notifies in subscription order, so the cache
// is always cleared ahead of the rebuild that re-measures.
useFontStore.subscribe(() => widths.clear())
void document.fonts.ready.then(() => widths.clear())

function context(): CanvasRenderingContext2D {
  if (measuring) return measuring
  const created = document.createElement('canvas').getContext('2d')
  if (!created) throw new Error('A 2D canvas context is unavailable for text measurement.')
  measuring = created
  return created
}

/**
 * The font declaration the canvas draws with. Fabric builds the same shorthand
 * from the object's raw family, and so does the print window, so the requested
 * family is used as written rather than run through `resolveFontFamily`:
 * `fontStore` registers every bundled family under its aliases as well, and a
 * family that is registered nowhere falls back identically in both places.
 */
function declaration(font: TextFontSpec, sizePx: number): string {
  return `${font.fontStyle} ${font.fontWeight} ${sizePx}px ${JSON.stringify(font.fontFamily)}`
}

/**
 * Measures with the canvas the editor draws on, so `fitText` wraps where Fabric
 * wraps instead of where the shared glyph-class approximation guesses.
 */
export const canvasTextMeasurer: TextMeasurer = (text, fontSizePt, font) => {
  if (!text) return 0
  const canvasFont = declaration(font, mmToPx(ptToMm(fontSizePt), CSS_DPI))
  const key = `${canvasFont}\u0000${text}`
  const cached = widths.get(key)
  if (cached !== undefined) return cached
  const target = context()
  target.font = canvasFont
  const width = pxToMm(target.measureText(text).width, CSS_DPI)
  if (widths.size >= CACHE_LIMIT) widths.clear()
  widths.set(key, width)
  return width
}
