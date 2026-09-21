/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { z } from 'zod'
import type { LabelStock } from './template/types'
type LabelDimensions = Pick<LabelStock, 'widthMm' | 'heightMm' | 'dpi'>
function mediaDimensions(label: LabelDimensions | LabelStock): {
  widthMm: number
  heightMm: number
} {
  return 'feed' in label && label.feed.kind === 'sheet'
    ? { widthMm: label.feed.sheetWidthMm, heightMm: label.feed.sheetHeightMm }
    : label
}
export const printSettingsSchema = z.object({
  printMethod: z.enum(['electron', 'gdi']).default('electron'),
  /** Complete driver-owned DEVMODE, including private bytes, encoded for repository storage. */
  gdiDevMode: z.string().max(2_000_000).optional(),
  copies: z.number().int().min(1).max(9999),
  collate: z.boolean(),
  monochrome: z.boolean(),
  sizing: z.enum(['fit', 'actual', 'shrink', 'custom']),
  customScale: z.number().min(1).max(1000),
  chooseLabelPaper: z.boolean(),
  orientation: z.enum(['auto', 'portrait', 'landscape']),
  offsetX: z.number().min(-10).max(10),
  offsetY: z.number().min(-10).max(10),
  paperWidthMm: z.number().min(1).max(2000),
  paperHeightMm: z.number().min(1).max(2000),
  marginMm: z.number().min(0).max(100)
})
export type PrintSettings = z.infer<typeof printSettingsSchema>
export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  printMethod: 'electron',
  copies: 1,
  collate: true,
  monochrome: false,
  sizing: 'actual',
  customScale: 100,
  chooseLabelPaper: true,
  orientation: 'auto',
  offsetX: 0,
  offsetY: 0,
  paperWidthMm: 210,
  paperHeightMm: 297,
  marginMm: 0
}
export function printLayout(
  label: LabelDimensions,
  settings: PrintSettings
): {
  width: number
  height: number
  scale: number
  x: number
  y: number
  margin: number
} {
  const s = printSettingsSchema.parse(settings)
  const media = mediaDimensions(label)
  let width = s.chooseLabelPaper ? media.widthMm : s.paperWidthMm
  let height = s.chooseLabelPaper ? media.heightMm : s.paperHeightMm
  if (
    (s.orientation === 'portrait' && width > height) ||
    (s.orientation === 'landscape' && height > width)
  )
    [width, height] = [height, width]
  if (
    s.orientation === 'auto' &&
    !s.chooseLabelPaper &&
    media.widthMm > media.heightMm !== width > height
  )
    [width, height] = [height, width]
  const margin = s.chooseLabelPaper ? 0 : s.marginMm
  if (2 * margin >= Math.min(width, height))
    throw new Error('Printable margins leave no space on the paper.')
  const fit = Math.min((width - margin * 2) / media.widthMm, (height - margin * 2) / media.heightMm)
  const scale =
    s.sizing === 'fit'
      ? fit
      : s.sizing === 'shrink'
        ? Math.min(1, fit)
        : s.sizing === 'custom'
          ? s.customScale / 100
          : 1
  return {
    width,
    height,
    scale,
    margin,
    x: (width - media.widthMm * scale) / 2 + s.offsetX,
    y: (height - media.heightMm * scale) / 2 + s.offsetY
  }
}
