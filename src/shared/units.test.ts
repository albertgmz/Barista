/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import {
  alignToPrinterDot,
  clamp,
  mmToPt,
  mmToPx,
  parseMeasurement,
  ptToMm,
  pxToMm,
  roundMm
} from '@shared/units'

describe('mmToPx', () => {
  it('converts one inch to the dot count for the resolution', () => {
    expect(mmToPx(25.4, 300)).toBeCloseTo(300, 10)
    expect(mmToPx(25.4, 203)).toBeCloseTo(203, 10)
  })

  it('converts the default 60 x 35 mm label at 300 dpi', () => {
    expect(mmToPx(60, 300)).toBeCloseTo(708.661, 3)
    expect(mmToPx(35, 300)).toBeCloseTo(413.386, 3)
  })

  it('maps zero millimetres to zero dots', () => {
    expect(mmToPx(0, 300)).toBe(0)
  })
})

describe('pxToMm', () => {
  it('round-trips through mmToPx', () => {
    for (const dpi of [203, 300, 600]) {
      expect(pxToMm(mmToPx(37.5, dpi), dpi)).toBeCloseTo(37.5, 10)
    }
  })
})

describe('points', () => {
  it('treats 72 points as one inch', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 10)
    expect(ptToMm(72)).toBeCloseTo(25.4, 10)
  })
})

describe('roundMm', () => {
  it('rounds geometry to one micron by default', () => {
    expect(roundMm(12.3456)).toBe(12.346)
  })

  it('honours an explicit precision', () => {
    expect(roundMm(12.3456, 3)).toBe(12.346)
    expect(roundMm(12.3456, 0)).toBe(12)
  })
})

describe('parseMeasurement', () => {
  it.each([
    ['25.4', 25.4],
    ['1in', 25.4],
    ['12.5mm', 12.5],
    ['10+2.5', 12.5],
    ['2*(3+4mm)', 14],
    ['50%', 30]
  ])('parses %s', (source, expected) => {
    expect(parseMeasurement(source, { defaultUnit: 'mm', percentBaseMm: 60 })).toBe(expected)
  })
  it('uses inches for bare values when requested and rejects invalid math', () => {
    expect(parseMeasurement('2', { defaultUnit: 'in', percentBaseMm: 100 })).toBe(50.8)
    expect(() => parseMeasurement('1/0')).toThrow('finite')
    expect(() => parseMeasurement('alert(1)')).toThrow('position')
  })
})

describe('printer dot alignment', () => {
  it.each([203, 300, 600])('round-trips to an integer dot at %i DPI', (dpi) => {
    const aligned = alignToPrinterDot(12.345, dpi)
    expect(mmToPx(aligned, dpi)).toBeCloseTo(Math.round(mmToPx(12.345, dpi)), 2)
  })
})

describe('clamp', () => {
  it('passes through a value inside the range', () => {
    expect(clamp(0.5, 0.1, 8)).toBe(0.5)
  })

  it('clamps to each bound', () => {
    expect(clamp(-3, 0.1, 8)).toBe(0.1)
    expect(clamp(99, 0.1, 8)).toBe(8)
  })
})
