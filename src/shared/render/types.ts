/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * The rendering abstraction.
 *
 * One template is drawn by several back ends: the on-screen design canvas, a
 * PDF export, and the two thermal printer command languages. They all consume
 * the same {@link LabelTemplate} plus a {@link RenderContext} of resolved
 * variable values, and differ only in what they emit.
 *
 * This module is shared with the main process, which typechecks without the
 * DOM library, so nothing here may reference DOM types. The canvas back end
 * talks to {@link CanvasRenderTarget} instead of an `HTMLCanvasElement`.
 */

import type { LabelTemplate } from '../template/types'

export type RendererId = 'canvas' | 'pdf' | 'zpl' | 'tspl'

/** Everything a renderer needs that is not part of the template itself. */
export interface RenderContext {
  /** Resolved variable values, keyed by {@link LabelVariable.name}. */
  values: Readonly<Record<string, string>>
  /** Output resolution. Overrides the template's own dpi when the printer differs. */
  dpi: number
  copies: number
}

/**
 * A DOM-free view of a drawing surface, so this module stays usable from the
 * main process. The renderer process adapts a Fabric canvas to this shape.
 */
export interface CanvasRenderTarget {
  readonly widthPx: number
  readonly heightPx: number
  clear(): void
}

/**
 * Turns a template plus resolved values into `TOutput`.
 *
 * @typeParam TOutput - `void` when the renderer draws onto a target it was
 * constructed with, otherwise the emitted bytes or command text.
 */
export interface LabelRenderer<TOutput = unknown> {
  readonly id: RendererId
  readonly displayName: string
  render(template: LabelTemplate, context: RenderContext): Promise<TOutput>
}
