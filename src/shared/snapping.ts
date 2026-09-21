/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelObject, LabelStock } from './template/types'
type SnapStock = Pick<LabelStock, 'widthMm' | 'heightMm' | 'dpi'>
import { bounds } from './template/document'
import { alignToPrinterDot } from './units'
export interface SnapResult {
  x: number
  y: number
  guides: { axis: 'x' | 'y'; position: number }[]
}
export interface SnapOptions {
  grid?: boolean
  label?: boolean
  objects?: boolean
  guides?: readonly { axis: 'x' | 'y'; positionMm: number }[]
  printerDots?: boolean
}
export function snap(
  box: { x: number; y: number; width: number; height: number },
  size: SnapStock,
  objects: LabelObject[],
  grid: number,
  tolerance = 0.7,
  options: SnapOptions = {}
): SnapResult {
  const result: SnapResult = { x: box.x, y: box.y, guides: [] }
  for (const axis of ['x', 'y'] as const) {
    const extent = axis === 'x' ? 'width' : 'height'
    const labelExtent = axis === 'x' ? size.widthMm : size.heightMm
    const targets: number[] = []
    if (options.label !== false) targets.push(0, labelExtent / 2, labelExtent)
    if (options.objects !== false)
      targets.push(
        ...objects
          .filter((o) => o.visible)
          .flatMap((o) => {
            const b = bounds([o])
            return [b[axis], b[axis] + b[extent] / 2, b[axis] + b[extent]]
          })
      )
    targets.push(
      ...(options.guides ?? [])
        .filter((guide) => guide.axis === axis)
        .map((guide) => guide.positionMm)
    )
    if (options.grid !== false && grid > 0) targets.push(Math.round(box[axis] / grid) * grid)
    if (options.printerDots) targets.push(alignToPrinterDot(box[axis], size.dpi))
    let delta = tolerance + 1,
      guide = 0
    for (const point of [box[axis], box[axis] + box[extent] / 2, box[axis] + box[extent]]) {
      for (const target of targets)
        if (Math.abs(target - point) < Math.abs(delta)) {
          delta = target - point
          guide = target
        }
    }
    if (Math.abs(delta) <= tolerance) {
      result[axis] += delta
      result.guides.push({ axis, position: guide })
    }
  }
  return result
}
