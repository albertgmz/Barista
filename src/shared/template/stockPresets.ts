/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { MM_PER_INCH } from '../units'
import { DEFAULT_STOCK } from './document'
import type { LabelStock } from './types'

export type StockPresetCategory =
  'Recent' | 'My Presets' | 'Thermal – inches' | 'Thermal – metric' | 'Sheets' | 'Small industrial'

export interface StockPreset {
  id: string
  name: string
  category: StockPresetCategory
  units: 'in' | 'mm'
  stock: LabelStock
  custom?: boolean
}

const roll = (widthMm: number, heightMm: number): LabelStock => ({
  ...DEFAULT_STOCK,
  widthMm,
  heightMm
})
const inches = (value: number): number => value * MM_PER_INCH

const imperialSizes = [
  [4, 6],
  [4, 3],
  [4, 2],
  [3, 2],
  [3, 1],
  [2.25, 1.25],
  [2, 1],
  [1.5, 1],
  [1, 0.5]
] as const
const metricSizes = [
  [100, 150],
  [100, 50],
  [60, 40],
  [60, 35],
  [50, 30],
  [50, 25],
  [40, 30]
] as const
const industrialSizes = [
  [30, 20],
  [25, 10]
] as const

const thermalInches: StockPreset[] = imperialSizes.map(([width, height]) => ({
  id: `thermal-in-${width}x${height}`,
  name: `${width} × ${height} in`,
  category: 'Thermal – inches',
  units: 'in',
  stock: roll(inches(width), inches(height))
}))
const thermalMetric: StockPreset[] = metricSizes.map(([width, height]) => ({
  id: `thermal-mm-${width}x${height}`,
  name: `${width} × ${height} mm`,
  category: 'Thermal – metric',
  units: 'mm',
  stock: roll(width, height)
}))
const smallIndustrial: StockPreset[] = industrialSizes.map(([width, height]) => ({
  id: `industrial-mm-${width}x${height}`,
  name: `${width} × ${height} mm`,
  category: 'Small industrial',
  units: 'mm',
  stock: roll(width, height)
}))

// Avery's official template pages document the label dimensions, US Letter sheet size and count:
// https://www.avery.com/templates/5160 and https://www.avery.com/templates/5163
// Pitch values follow the corresponding official blank layouts. Presets whose complete layout is
// not documented are deliberately omitted.
const sheets: StockPreset[] = [
  {
    id: 'avery-5160',
    name: 'Avery 5160 — 30 per Letter sheet',
    category: 'Sheets',
    units: 'in',
    stock: {
      ...roll(inches(2.625), inches(1)),
      gapMm: inches(0.125),
      feed: {
        kind: 'sheet',
        rows: 10,
        columns: 3,
        pitchXMm: inches(2.75),
        pitchYMm: inches(1),
        sheetWidthMm: inches(8.5),
        sheetHeightMm: inches(11)
      }
    }
  },
  {
    id: 'avery-5163',
    name: 'Avery 5163 — 10 per Letter sheet',
    category: 'Sheets',
    units: 'in',
    stock: {
      ...roll(inches(4), inches(2)),
      gapMm: inches(0.1875),
      feed: {
        kind: 'sheet',
        rows: 5,
        columns: 2,
        pitchXMm: inches(4.1875),
        pitchYMm: inches(2),
        sheetWidthMm: inches(8.5),
        sheetHeightMm: inches(11)
      }
    }
  }
]

export const BUILT_IN_STOCK_PRESETS: readonly StockPreset[] = [
  ...thermalInches,
  ...thermalMetric,
  ...sheets,
  ...smallIndustrial
]

export const STOCK_PRESET_CATEGORIES: readonly StockPresetCategory[] = [
  'Recent',
  'My Presets',
  'Thermal – inches',
  'Thermal – metric',
  'Sheets',
  'Small industrial'
]
