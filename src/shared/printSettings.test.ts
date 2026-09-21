/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRINT_SETTINGS, printLayout } from './printSettings'
import { mmToPx, pxToMm, mmToPt, ptToMm } from './units'
import { snap } from './snapping'
import { BUILT_IN_STOCK_PRESETS } from './template/stockPresets'
describe('physical units and print layout', () => {
  for (const dpi of [203, 300, 600])
    it(`round trips physical units at ${dpi} DPI`, () => {
      for (const mm of [0.1, 25.4, 35, 60, 101.6, 152.4]) {
        expect(pxToMm(mmToPx(mm, dpi), dpi)).toBeCloseTo(mm, 10)
        expect(ptToMm(mmToPt(mm))).toBeCloseTo(mm, 10)
      }
      expect(mmToPx(25.4, dpi)).toBe(dpi)
    })
  for (const [widthMm, heightMm] of [
    [60, 35],
    [101.6, 152.4],
    [50.8, 25.4]
  ]) {
    for (const sizing of ['fit', 'actual', 'shrink', 'custom'] as const) {
      for (const orientation of ['auto', 'portrait', 'landscape'] as const)
        it(`${widthMm} × ${heightMm}, ${sizing}, ${orientation}`, () => {
          const label = { widthMm: widthMm!, heightMm: heightMm!, dpi: 300 }
          const result = printLayout(label, {
            ...DEFAULT_PRINT_SETTINGS,
            sizing,
            orientation,
            customScale: 75,
            offsetX: 2,
            offsetY: -3
          })
          expect([result.width, result.height].sort((a, b) => a - b)).toEqual(
            [widthMm, heightMm].sort((a, b) => a! - b!)
          )
          expect(result.x).toBeCloseTo((result.width - label.widthMm * result.scale) / 2 + 2)
          expect(result.y).toBeCloseTo((result.height - label.heightMm * result.scale) / 2 - 3)
          if (sizing === 'actual') expect(result.scale).toBe(1)
          if (sizing === 'custom') expect(result.scale).toBe(0.75)
          if (sizing === 'shrink') expect(result.scale).toBeLessThanOrEqual(1)
          if (sizing === 'fit')
            expect(
              Math.max(
                (label.widthMm * result.scale) / result.width,
                (label.heightMm * result.scale) / result.height
              )
            ).toBeCloseTo(1)
        })
    }
  }
  it('fits printable bounds and rejects impossible margins', () => {
    const label = { widthMm: 60, heightMm: 35, dpi: 300 }
    const settings = {
      ...DEFAULT_PRINT_SETTINGS,
      chooseLabelPaper: false,
      paperWidthMm: 100,
      paperHeightMm: 50,
      marginMm: 5,
      sizing: 'fit' as const
    }
    expect(printLayout(label, settings).scale).toBeCloseTo(40 / 35)
    expect(() => printLayout(label, { ...settings, marginMm: 25 })).toThrow()
  })
  it('uses the full sheet dimensions for sheet stock', () => {
    const sheet = BUILT_IN_STOCK_PRESETS.find((preset) => preset.id === 'avery-5160')!.stock
    expect(printLayout(sheet, DEFAULT_PRINT_SETTINGS)).toMatchObject({
      width: sheet.feed.kind === 'sheet' ? sheet.feed.sheetWidthMm : 0,
      height: sheet.feed.kind === 'sheet' ? sheet.feed.sheetHeightMm : 0,
      scale: 1,
      x: 0,
      y: 0
    })
  })
  it('snaps to label edges and grid with guides', () => {
    const size = { widthMm: 60, heightMm: 35, dpi: 300 }
    expect(snap({ x: 0.2, y: 4.8, width: 10, height: 5 }, size, [], 5).x).toBe(0)
    expect(snap({ x: 0.2, y: 4.8, width: 10, height: 5 }, size, [], 5).y).toBe(5)
    expect(snap({ x: 2, y: 2, width: 10, height: 5 }, size, [], 0, 0.1).guides).toEqual([])
  })
})
