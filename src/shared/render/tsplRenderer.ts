/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelTemplate } from '../template/types'
import type { LabelRenderer, RenderContext } from './types'
import { NotImplementedError } from '../errors'

/**
 * Emits TSPL for TSC and compatible thermal printers.
 *
 * TODO: emit SIZE/GAP from template.stock, then TEXT, BARCODE, QRCODE and
 * BITMAP commands per object, and finish with PRINT for context.copies.
 */
export class TsplRenderer implements LabelRenderer<string> {
  readonly id = 'tspl' as const
  readonly displayName = 'TSPL (TSC)'

  async render(_template: LabelTemplate, _context: RenderContext): Promise<string> {
    throw new NotImplementedError('TSPL rendering')
  }
}
