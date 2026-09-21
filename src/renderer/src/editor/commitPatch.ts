/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelObject } from '@shared/template/types'

export interface CommitGeometry {
  centerXMm: number
  centerYMm: number
  widthMm: number
  heightMm: number
  rotation: number
}

export interface CommitSource {
  objectId: string
  kind: LabelObject['kind']
  geometry: CommitGeometry
  /**
   * The width of the box the canvas item carries, which only a resize handle
   * moves. Absent for items that track no box, which commit what they measure.
   */
  boxWidthMm?: number
  canvasText?: string
  contentHeightMm?: number
}

/**
 * The string carried by a canvas textbox is the fitted and wrapped render of
 * the source text, and with sample data on it is a resolved value rather than
 * the expression. It may only be written back to the one object inline editing
 * produced it for; every other gesture keeps the source text.
 *
 * Typing grows the box downwards to the height the text needs, so a wrapped
 * line is never left reported as overflow; dragging the box still wins, since
 * only the object being edited grows.
 *
 * Width is the mirror of that: Fabric never breaks a word, it widens the box to
 * hold the longest one, so what the canvas measures across is not what the user
 * sized. The tracked box width is committed instead, and only a resize handle
 * moves it.
 */
export function commitPatch(source: CommitSource, editedId: string | null): Partial<LabelObject> {
  const { centerXMm, centerYMm, heightMm, rotation } = source.geometry,
    widthMm = source.boxWidthMm ?? source.geometry.widthMm,
    edited =
      source.kind === 'text' && source.objectId === editedId && source.canvasText !== undefined
  return {
    xMm: centerXMm - widthMm / 2,
    yMm: centerYMm - heightMm / 2,
    widthMm,
    heightMm: edited ? Math.max(heightMm, source.contentHeightMm ?? 0) : heightMm,
    rotation,
    ...(edited ? { text: source.canvasText } : {})
  }
}
