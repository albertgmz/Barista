/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { clamp } from '@shared/units'

export const DEFAULT_FIT_FRACTION = 0.9
export const DEFAULT_MAX_FIT_ZOOM = 8

export interface ViewportLayoutInput {
  containerWidth: number
  containerHeight: number
  labelWidth: number
  labelHeight: number
}

export interface CenteredViewport {
  zoom: number
  offsetX: number
  offsetY: number
}

export function resizedViewport(input: {
  previousWidth: number
  previousHeight: number
  containerWidth: number
  containerHeight: number
  zoom: number
  offsetX: number
  offsetY: number
}): CenteredViewport | null {
  if (
    input.previousWidth <= 0 ||
    input.previousHeight <= 0 ||
    input.containerWidth <= 0 ||
    input.containerHeight <= 0 ||
    input.zoom <= 0
  )
    return null

  return {
    zoom: input.zoom,
    offsetX: input.offsetX + (input.containerWidth - input.previousWidth) / 2,
    offsetY: input.offsetY + (input.containerHeight - input.previousHeight) / 2
  }
}

export function centeredViewport(
  input: ViewportLayoutInput & { zoom: number }
): CenteredViewport | null {
  const { containerWidth, containerHeight, labelWidth, labelHeight, zoom } = input
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    labelWidth <= 0 ||
    labelHeight <= 0 ||
    zoom <= 0
  )
    return null

  return {
    zoom,
    offsetX: (containerWidth - labelWidth * zoom) / 2,
    offsetY: (containerHeight - labelHeight * zoom) / 2
  }
}

export function fitViewport(
  input: ViewportLayoutInput & {
    fitFraction?: number
    minZoom?: number
    maxZoom?: number
  }
): CenteredViewport | null {
  const {
    containerWidth,
    containerHeight,
    labelWidth,
    labelHeight,
    fitFraction = DEFAULT_FIT_FRACTION,
    minZoom = 0.1,
    maxZoom = DEFAULT_MAX_FIT_ZOOM
  } = input
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    labelWidth <= 0 ||
    labelHeight <= 0 ||
    fitFraction <= 0 ||
    fitFraction > 1
  )
    return null

  const zoom = clamp(
    Math.min(
      (containerWidth * fitFraction) / labelWidth,
      (containerHeight * fitFraction) / labelHeight
    ),
    minZoom,
    maxZoom
  )
  return centeredViewport({ ...input, zoom })
}
