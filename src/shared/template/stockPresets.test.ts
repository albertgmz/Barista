/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { BUILT_IN_STOCK_PRESETS } from './stockPresets'

describe('stock presets', () => {
  it('contains every required thermal dimension', () => {
    const names = BUILT_IN_STOCK_PRESETS.map((preset) => preset.name)
    for (const name of [
      '4 × 6 in',
      '4 × 3 in',
      '4 × 2 in',
      '3 × 2 in',
      '3 × 1 in',
      '2.25 × 1.25 in',
      '2 × 1 in',
      '1.5 × 1 in',
      '1 × 0.5 in',
      '100 × 150 mm',
      '100 × 50 mm',
      '60 × 40 mm',
      '50 × 30 mm',
      '50 × 25 mm',
      '40 × 30 mm',
      '30 × 20 mm',
      '25 × 10 mm'
    ])
      expect(names).toContain(name)
  })

  it('defines complete physical sheet geometry', () => {
    for (const preset of BUILT_IN_STOCK_PRESETS.filter((item) => item.category === 'Sheets')) {
      expect(preset.stock.feed.kind).toBe('sheet')
      if (preset.stock.feed.kind !== 'sheet') continue
      expect(preset.stock.feed.rows * preset.stock.feed.columns).toBeGreaterThan(1)
      expect(preset.stock.feed.sheetWidthMm).toBeGreaterThan(preset.stock.widthMm)
      expect(preset.stock.feed.sheetHeightMm).toBeGreaterThan(preset.stock.heightMm)
    }
  })
})
