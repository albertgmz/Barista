/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { snap } from './snapping'
import { createObject } from './template/document'

describe('precision snapping', () => {
  const size = { widthMm: 60, heightMm: 35, dpi: 300 }
  it('snaps to manual guides, label centres and object edges', () => {
    const object = createObject('rect', 20, 10)
    const guide = snap({ x: 9.7, y: 17.2, width: 10, height: 5 }, size, [object], 0, 0.5, {
      guides: [{ axis: 'x', positionMm: 10 }],
      grid: false
    })
    expect(guide.x).toBe(10)
    expect(guide.y).toBe(17.5)
  })
  it('aligns movement to printer dots when enabled', () => {
    const result = snap({ x: 1.02, y: 2.03, width: 10, height: 5 }, size, [], 0, 0.01, {
      label: false,
      objects: false,
      printerDots: true
    })
    expect((result.x / 25.4) * 300).toBeCloseTo(Math.round((1.02 / 25.4) * 300), 2)
  })
  it('can disable every snap target', () => {
    expect(
      snap({ x: 0.2, y: 0.2, width: 10, height: 5 }, size, [], 5, 1, {
        grid: false,
        label: false,
        objects: false
      })
    ).toMatchObject({ x: 0.2, y: 0.2, guides: [] })
  })
})
