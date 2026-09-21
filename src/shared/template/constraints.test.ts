/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { bounds, constrainObjectToStock, createObject, DEFAULT_STOCK } from './document'

describe('constrainObjectToStock', () => {
  it('moves an object back inside the label without resizing it', () => {
    const object = { ...createObject('text', -7, 31), widthMm: 20, heightMm: 10 }
    const result = constrainObjectToStock(object, DEFAULT_STOCK)

    expect(result.widthMm).toBe(20)
    expect(result.heightMm).toBe(10)
    expect(bounds([result])).toMatchObject({ x: 0, y: 25, width: 20, height: 10 })
  })

  it('scales an oversized rotated object until its visual bounds fit', () => {
    const object = { ...createObject('rect', -20, -20), widthMm: 100, heightMm: 80, rotation: 30 }
    const result = constrainObjectToStock(object, DEFAULT_STOCK)
    const box = bounds([result])

    expect(box.x).toBeGreaterThanOrEqual(-0.001)
    expect(box.y).toBeGreaterThanOrEqual(-0.001)
    expect(box.x + box.width).toBeLessThanOrEqual(DEFAULT_STOCK.widthMm + 0.001)
    expect(box.y + box.height).toBeLessThanOrEqual(DEFAULT_STOCK.heightMm + 0.001)
    expect(result.widthMm).toBeLessThan(object.widthMm)
    expect(result.heightMm / result.widthMm).toBeCloseTo(object.heightMm / object.widthMm)
  })
})
