/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Unit conversions shared by the editor, the renderers and the print pipeline.
 *
 * Templates store geometry in millimetres. The canvas works in CSS pixels and
 * the print renderers work in device dots, so every conversion goes through
 * these helpers rather than through inline arithmetic.
 */

export const MM_PER_INCH = 25.4
export const POINTS_PER_INCH = 72

/** Millimetres to device dots at the given resolution. */
export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi
}

/** Device dots at the given resolution back to millimetres. */
export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH
}

/** Millimetres to typographic points. */
export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * POINTS_PER_INCH
}

/** Typographic points to millimetres. */
export function ptToMm(pt: number): number {
  return (pt / POINTS_PER_INCH) * MM_PER_INCH
}

/**
 * Rounds a millimetre value for display. Label geometry is meaningless below
 * about a micron, and unrounded floats make the properties panel jitter.
 */
export function roundMm(mm: number, decimals = 3): number {
  const factor = 10 ** decimals
  return Math.round(mm * factor) / factor
}

export interface MeasurementContext {
  defaultUnit?: 'mm' | 'in'
  percentBaseMm?: number
}

/** Parses a small arithmetic expression and returns millimetres. */
export function parseMeasurement(source: string, context: MeasurementContext = {}): number {
  const input = source.replace(/\s+/g, '')
  let position = 0
  const defaultFactor = context.defaultUnit === 'in' ? MM_PER_INCH : 1

  const expression = (): number => {
    let value = term()
    while (input[position] === '+' || input[position] === '-') {
      const operator = input[position++]
      const right = term()
      value = operator === '+' ? value + right : value - right
    }
    return value
  }
  const term = (): number => {
    let value = unary()
    while (input[position] === '*' || input[position] === '/') {
      const operator = input[position++]
      const right = unary()
      value = operator === '*' ? value * right : value / right
    }
    return value
  }
  const unary = (): number => {
    if (input[position] === '+') {
      position += 1
      return unary()
    }
    if (input[position] === '-') {
      position += 1
      return -unary()
    }
    return primary()
  }
  const primary = (): number => {
    if (input[position] === '(') {
      position += 1
      const value = expression()
      if (input[position] !== ')') throw new Error(`Expected ) at position ${position + 1}.`)
      position += 1
      return value
    }
    const match = input.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i)
    if (!match) throw new Error(`Expected a number at position ${position + 1}.`)
    position += match[0].length
    const value = Number(match[0])
    const suffix = input
      .slice(position)
      .match(/^(mm|in|%)/i)?.[0]
      ?.toLowerCase()
    if (suffix) position += suffix.length
    if (suffix === 'in') return value * MM_PER_INCH
    if (suffix === '%') {
      if (!Number.isFinite(context.percentBaseMm))
        throw new Error('A percentage requires a label dimension.')
      return (value / 100) * context.percentBaseMm!
    }
    return value * (suffix === 'mm' ? 1 : defaultFactor)
  }

  if (!input) throw new Error('Enter a measurement.')
  const result = expression()
  if (position !== input.length) throw new Error(`Unexpected input at position ${position + 1}.`)
  if (!Number.isFinite(result)) throw new Error('The measurement must be finite.')
  return roundMm(result)
}

/** Returns the physical position of the nearest device dot. */
export function alignToPrinterDot(mm: number, dpi: number): number {
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error('Printer DPI must be positive.')
  return pxToMm(Math.round(mmToPx(mm, dpi)), dpi)
}

/** Restricts `value` to the inclusive range [`min`, `max`]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
