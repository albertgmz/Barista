/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelTemplate } from '../template/types'
import type { CanvasRenderTarget, LabelRenderer, RenderContext } from './types'
import { NotImplementedError } from '../errors'

/**
 * Draws a template onto the on-screen design canvas.
 *
 * TODO: walk template.design.objects in zIndex order, convert each object from
 * millimetres to canvas pixels via mmToPx, and emit the matching Fabric
 * object. Text and barcode objects must first resolve their data expression
 * against context.values.
 */
export class CanvasRenderer implements LabelRenderer<void> {
  readonly id = 'canvas' as const
  readonly displayName = 'Design canvas'

  constructor(readonly target: CanvasRenderTarget) {}

  async render(_template: LabelTemplate, _context: RenderContext): Promise<void> {
    throw new NotImplementedError('Canvas rendering')
  }
}
