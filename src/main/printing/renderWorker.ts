/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelDocument } from '@shared/template/types'
import type { PrintSettings } from '@shared/printSettings'
import type { EvaluationContext } from '@shared/variables'
import { renderLabelSvg } from './labelSvg'

interface Request {
  id: number
  document: LabelDocument
  settings: PrintSettings
  /** How the caller wants variables resolved; printing passes real values, a thumbnail samples. */
  context?: EvaluationContext
}
const parent = process.parentPort
if (!parent) throw new Error('The render worker requires a parent port.')
parent.on('message', (event) => {
  const request = event.data as Request
  try {
    parent.postMessage({
      id: request.id,
      svg: renderLabelSvg(request.document, request.settings, request.context)
    })
  } catch (error) {
    parent.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})
