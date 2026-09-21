/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelTemplate } from '../template/types'
import type { LabelRenderer, RenderContext } from './types'
import { NotImplementedError } from '../errors'

/**
 * Emits ZPL II for Zebra thermal printers.
 *
 * TODO: convert millimetres to dots at context.dpi, emit ^XA/^XZ around the
 * label, map text to ^FO/^A/^FD, barcodes to their ^B command, and images to
 * ^GFA after monochrome conversion. Prefer native ^B commands over rasterized
 * images so the printer keeps full barcode resolution.
 */
export class ZplRenderer implements LabelRenderer<string> {
  readonly id = 'zpl' as const
  readonly displayName = 'ZPL II (Zebra)'

  async render(_template: LabelTemplate, _context: RenderContext): Promise<string> {
    throw new NotImplementedError('ZPL rendering')
  }
}
