/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelTemplate } from '../template/types'
import type { LabelRenderer, RenderContext } from './types'
import { NotImplementedError } from '../errors'

/**
 * Renders a template to a PDF document, used by File > Export PDF and for
 * printing through a Windows driver that expects page output.
 *
 * TODO: build a single page sized to template.stock, place every object at its
 * millimetre coordinates, and embed the fonts the text objects reference.
 * Returns the PDF bytes so the caller decides where they go.
 */
export class PdfRenderer implements LabelRenderer<Uint8Array> {
  readonly id = 'pdf' as const
  readonly displayName = 'PDF document'

  async render(_template: LabelTemplate, _context: RenderContext): Promise<Uint8Array> {
    throw new NotImplementedError('PDF rendering')
  }
}
