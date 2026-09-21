/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { centeredViewport, fitViewport, resizedViewport } from './canvasViewport'

describe('canvas viewport layout', () => {
  it('defers fitting until the container has a real size', () => {
    expect(
      fitViewport({ containerWidth: 0, containerHeight: 0, labelWidth: 240, labelHeight: 120 })
    ).toBeNull()

    expect(
      fitViewport({
        containerWidth: 1000,
        containerHeight: 600,
        labelWidth: 240,
        labelHeight: 120
      })
    ).toEqual({ zoom: 3.75, offsetX: 50, offsetY: 75 })
  })

  it('uses ninety percent of the viewport and caps tiny-label zoom', () => {
    expect(
      fitViewport({
        containerWidth: 1000,
        containerHeight: 600,
        labelWidth: 20,
        labelHeight: 10,
        maxZoom: 8
      })
    ).toEqual({ zoom: 8, offsetX: 420, offsetY: 260 })
  })

  it('centers at the current zoom even when the label is larger than the viewport', () => {
    expect(
      centeredViewport({
        containerWidth: 500,
        containerHeight: 300,
        labelWidth: 400,
        labelHeight: 250,
        zoom: 2
      })
    ).toEqual({ zoom: 2, offsetX: -150, offsetY: -100 })
  })

  it('keeps the current zoom and user pan when the viewport is resized', () => {
    expect(
      resizedViewport({
        previousWidth: 800,
        previousHeight: 500,
        containerWidth: 1000,
        containerHeight: 700,
        zoom: 2.5,
        offsetX: 125,
        offsetY: -40
      })
    ).toEqual({ zoom: 2.5, offsetX: 225, offsetY: 60 })
  })
})
