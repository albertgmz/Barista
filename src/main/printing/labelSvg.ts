/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { pageSvg } from '@shared/render/svg'
import { barcodeSvg } from '@shared/render/barcode'
import type { LabelDocument } from '@shared/template/types'
import type { PrintSettings } from '@shared/printSettings'
import { evaluatedDocument, type EvaluationContext } from '@shared/variables'

/**
 * Renders one label page, including its barcode symbols.
 *
 * Symbols are encoded from resolved data: a literal `{placeholder}` is not
 * valid input for any length-constrained symbology, so the document is
 * evaluated before the symbols are generated. This pass and the one inside
 * `pageSvg` both read the source document with the same pinned context, so
 * they agree. Handing the evaluated document to `pageSvg` instead would
 * substitute a second time over values that legitimately contain braces.
 */
export function renderLabelSvg(
  document: LabelDocument,
  settings: PrintSettings,
  context: EvaluationContext = {}
): string {
  // Pinned so a date variable cannot land on either side of a second boundary.
  const resolved: EvaluationContext = { ...context, now: context.now ?? new Date() }
  const evaluated = evaluatedDocument(document, resolved)
  if (evaluated.errors.length) throw new Error(evaluated.errors.join('\n'))
  const symbols = Object.fromEntries(
    evaluated.document.template.design.objects
      .filter((object) => object.kind === 'barcode' || object.kind === 'qrcode')
      .map((object) => [object.id, barcodeSvg(object)])
  )
  return pageSvg(document, settings, resolved, symbols)
}
