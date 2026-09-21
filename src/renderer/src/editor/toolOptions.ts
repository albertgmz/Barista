/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Decides what the tool options bar shows. A selection always wins over the
 * active tool, and keeps the position fields next to the controls for its own
 * kind; the tool only decides the bar when nothing is selected.
 */
import type { ObjectKind } from '@shared/template/types'
import type { ToolId } from '../store/editorStore'

/** A set of related controls in the options bar. */
export type OptionsGroup = 'text' | 'barcode' | 'image' | 'shape' | 'position'

export interface ToolOptionsLayout {
  /** Names the selection, or the active tool when there is none. */
  title: string
  /** Control groups to render, in order. */
  groups: OptionsGroup[]
  /** Shown in place of the controls when there is nothing to configure. */
  hint: string | null
}

const PLACEMENT_HINT = 'Click or drag on the label to place an object.'

const KIND_LABELS: Record<ObjectKind, string> = {
  text: 'Text',
  barcode: 'Barcode',
  qrcode: 'QR Code',
  image: 'Image',
  path: 'Path',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line'
}

const TOOL_LABELS: Record<ToolId, string> = {
  select: 'Select',
  text: 'Text',
  barcode: 'Barcode',
  qrcode: 'QR Code',
  image: 'Image',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  pen: 'Pen'
}

/** Controls that edit a selected object of each kind. */
const KIND_GROUPS: Record<ObjectKind, readonly OptionsGroup[]> = {
  text: ['text'],
  barcode: ['barcode'],
  qrcode: [],
  image: ['image'],
  path: ['shape'],
  rect: ['shape'],
  ellipse: ['shape'],
  line: ['shape']
}

/**
 * Defaults a tool applies to the object it draws next. Tools without defaults
 * leave the bar showing the placement hint.
 */
const TOOL_GROUPS: Record<ToolId, readonly OptionsGroup[]> = {
  select: [],
  text: ['text'],
  barcode: [],
  qrcode: [],
  image: ['image'],
  rect: ['shape'],
  ellipse: ['shape'],
  line: ['shape'],
  pen: ['shape']
}

export function toolOptionsLayout(
  selection: readonly ObjectKind[],
  tool: ToolId
): ToolOptionsLayout {
  const [kind] = selection
  if (kind === undefined) {
    const groups = [...TOOL_GROUPS[tool]]
    return {
      title: TOOL_LABELS[tool],
      groups,
      hint: groups.length === 0 ? PLACEMENT_HINT : null
    }
  }
  // Mixed kinds share nothing but their geometry.
  if (selection.some((other) => other !== kind))
    return { title: `${selection.length} objects`, groups: ['position'], hint: null }
  return {
    title: selection.length > 1 ? `${selection.length} × ${KIND_LABELS[kind]}` : KIND_LABELS[kind],
    groups: [...KIND_GROUPS[kind], 'position'],
    hint: null
  }
}
