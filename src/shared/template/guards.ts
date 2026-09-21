/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Runtime validation for templates read from disk.
 *
 * `template.json` comes from a file the app does not control, so it is parsed
 * as `unknown` and narrowed here before any other code touches it.
 *
 * These guards check the structure every object shares: the discriminant and
 * the base geometry. Per-kind field validation (for example, that a barcode
 * names a supported symbology) belongs in the template loader.
 *
 * TODO: extend to full per-kind validation once the loader in
 * `src/main/storage/templates.ts` is implemented.
 */

import type {
  LabelObject,
  LabelStock,
  LabelTemplate,
  LabelVariable,
  ObjectKind,
  VariableKind
} from './types'
import { TEMPLATE_FORMAT_VERSION } from './types'

/** Every object kind the format defines, for runtime validation. */
export const OBJECT_KINDS: readonly ObjectKind[] = [
  'text',
  'barcode',
  'qrcode',
  'image',
  'path',
  'rect',
  'ellipse',
  'line'
]

const VARIABLE_KINDS: readonly VariableKind[] = [
  'fixed',
  'prompt',
  'counter',
  'datetime',
  'formula',
  'field'
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** True when the label stock has finite, strictly positive dimensions. */
export function isLabelStock(value: unknown): value is LabelStock {
  if (!isRecord(value)) return false
  return (
    isFiniteNumber(value['widthMm']) &&
    value['widthMm'] > 0 &&
    isFiniteNumber(value['heightMm']) &&
    value['heightMm'] > 0 &&
    isFiniteNumber(value['dpi']) &&
    value['dpi'] > 0 &&
    ['rectangle', 'rounded', 'circle', 'ellipse'].includes(String(value['shape'])) &&
    isFiniteNumber(value['cornerRadiusMm']) &&
    isFiniteNumber(value['safeAreaMarginMm']) &&
    isFiniteNumber(value['gapMm']) &&
    isRecord(value['feed']) &&
    (value['feed']['kind'] === 'roll' || value['feed']['kind'] === 'sheet')
  )
}

export function isLabelVariable(value: unknown): value is LabelVariable {
  if (!isRecord(value)) return false
  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['name']) &&
    VARIABLE_KINDS.includes(value['kind'] as VariableKind)
  )
}

export function isLabelObject(value: unknown): value is LabelObject {
  if (!isRecord(value)) return false
  return (
    isNonEmptyString(value['id']) &&
    OBJECT_KINDS.includes(value['kind'] as ObjectKind) &&
    isFiniteNumber(value['xMm']) &&
    isFiniteNumber(value['yMm']) &&
    isFiniteNumber(value['widthMm']) &&
    isFiniteNumber(value['heightMm']) &&
    isFiniteNumber(value['rotation']) &&
    isFiniteNumber(value['zIndex'])
  )
}

function isAssetRef(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isNonEmptyString(value['id']) && isNonEmptyString(value['fileName'])
}

function isTemplateMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value['createdAt'] === 'string' &&
    typeof value['modifiedAt'] === 'string' &&
    isNonEmptyString(value['title']) &&
    Array.isArray(value['tags']) &&
    Number.isInteger(value['revision']) &&
    (value['status'] === 'draft' || value['status'] === 'approved')
  )
}

function isDataSource(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value['selection'])) return false
  const selection = value['selection']
  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['name']) &&
    isNonEmptyString(value['path']) &&
    (selection['kind'] === 'sheet' || selection['kind'] === 'table') &&
    isNonEmptyString(selection['name']) &&
    Number.isInteger(value['headerRow']) &&
    isNonEmptyString(value['keyColumn']) &&
    Array.isArray(value['mappings']) &&
    typeof value['writeStatusColumn'] === 'boolean'
  )
}

/**
 * True when this build can open the given schema version. Older templates are
 * migrated on load; newer ones are rejected because their fields are unknown.
 */
export function isSupportedTemplateVersion(version: unknown): version is number {
  return Number.isInteger(version) && version === TEMPLATE_FORMAT_VERSION
}

export function isLabelTemplate(value: unknown): value is LabelTemplate {
  if (!isRecord(value)) return false
  if (!isSupportedTemplateVersion(value['version'])) return false
  if (!isNonEmptyString(value['id'])) return false
  if (!isLabelStock(value['stock'])) return false
  if (!Array.isArray(value['variables']) || !value['variables'].every(isLabelVariable)) return false
  if (!Array.isArray(value['dataSources']) || !value['dataSources'].every(isDataSource))
    return false
  if (!isRecord(value['design'])) return false
  if (!Array.isArray(value['design']['guides'])) return false
  if (
    !Array.isArray(value['design']['objects']) ||
    !value['design']['objects'].every(isLabelObject)
  )
    return false
  // `assets` and `metadata` are required on LabelTemplate. Skipping them would
  // narrow a template that lacks them, and the first `template.assets.length`
  // would then throw well away from the file that caused it.
  if (!Array.isArray(value['assets']) || !value['assets'].every(isAssetRef)) return false
  if (!isTemplateMetadata(value['metadata'])) return false
  return true
}
