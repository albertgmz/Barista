/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { barcodeError } from './render/barcode'
import { fitText, type TextMeasurer } from './textFit'
import { bounds } from './template/document'
import type { LabelDocument, LabelObject, LabelStock } from './template/types'
import {
  analyzeVariableUsage,
  counterValue,
  evaluatedDocument,
  type EvaluationContext
} from './variables'

export type PreflightSeverity = 'error' | 'warning' | 'info'

export interface PreflightIssue {
  code: string
  severity: PreflightSeverity
  message: string
  objectId?: string
  objectName?: string
}

export interface PreflightResult {
  issues: PreflightIssue[]
  errors: number
  warnings: number
  info: number
}

export interface PreflightOptions extends EvaluationContext {
  installedFonts?: readonly string[]
  includeTemplateIssues?: boolean
  /** Supplied by the renderer so the report wraps text where the canvas does. */
  measureText?: TextMeasurer
}

export interface BatchPreflightRecord {
  key: string
  fields: Record<string, string>
}

export interface BatchPreflightRow extends PreflightResult {
  key: string
}

export interface BatchPreflightResult {
  rows: BatchPreflightRow[]
  rowsWithErrors: number
  rowsWithWarnings: number
  totalIssues: number
}

const severityOrder: Record<PreflightSeverity, number> = { error: 0, warning: 1, info: 2 }
const EPSILON = 0.001

function result(issues: PreflightIssue[]): PreflightResult {
  const sorted = [...issues].sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      (a.objectName ?? '').localeCompare(b.objectName ?? '') ||
      a.code.localeCompare(b.code)
  )
  return {
    issues: sorted,
    errors: sorted.filter((issue) => issue.severity === 'error').length,
    warnings: sorted.filter((issue) => issue.severity === 'warning').length,
    info: sorted.filter((issue) => issue.severity === 'info').length
  }
}

function issue(
  issues: PreflightIssue[],
  severity: PreflightSeverity,
  code: string,
  message: string,
  object?: LabelObject
): void {
  issues.push({
    severity,
    code,
    message,
    ...(object ? { objectId: object.id, objectName: object.name } : {})
  })
}

function intersects(a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    a.x + a.width > b.x + EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    a.y + a.height > b.y + EPSILON
  )
}

function corners(box: ReturnType<typeof bounds>): Array<{ x: number; y: number }> {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height }
  ]
}

function insideStock(point: { x: number; y: number }, stock: LabelStock): boolean {
  if (
    point.x < -EPSILON ||
    point.y < -EPSILON ||
    point.x > stock.widthMm + EPSILON ||
    point.y > stock.heightMm + EPSILON
  )
    return false
  if (stock.shape === 'rectangle') return true
  if (stock.shape === 'rounded') {
    const radius = Math.min(stock.cornerRadiusMm, stock.widthMm / 2, stock.heightMm / 2)
    if (radius <= EPSILON) return true
    if (
      (point.x >= radius && point.x <= stock.widthMm - radius) ||
      (point.y >= radius && point.y <= stock.heightMm - radius)
    )
      return true
    const centerX = point.x < radius ? radius : stock.widthMm - radius
    const centerY = point.y < radius ? radius : stock.heightMm - radius
    return (point.x - centerX) ** 2 + (point.y - centerY) ** 2 <= radius ** 2 + EPSILON
  }
  const rx = stock.widthMm / 2
  const ry = stock.heightMm / 2
  if (rx <= 0 || ry <= 0) return false
  const nx = (point.x - rx) / rx
  const ny = (point.y - ry) / ry
  return nx * nx + ny * ny <= 1 + EPSILON
}

function insideSafeArea(box: ReturnType<typeof bounds>, stock: LabelStock): boolean {
  const margin = stock.safeAreaMarginMm
  return (
    box.x >= margin - EPSILON &&
    box.y >= margin - EPSILON &&
    box.x + box.width <= stock.widthMm - margin + EPSILON &&
    box.y + box.height <= stock.heightMm - margin + EPSILON
  )
}

function base64Bytes(data: string): Uint8Array {
  try {
    const binary = atob(data)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return new Uint8Array()
  }
}

function rasterDimensions(
  mimeType: string,
  data: string
): { width: number; height: number } | null {
  const bytes = base64Bytes(data)
  if (mimeType === 'image/png' && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (mimeType !== 'image/jpeg') return null
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]!
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    if (length < 2) break
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker
      )
    )
      return {
        height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
        width: (bytes[offset + 7]! << 8) | bytes[offset + 8]!
      }
    offset += 2 + length
  }
  return null
}

function checkTemplate(
  document: LabelDocument,
  options: PreflightOptions,
  issues: PreflightIssue[]
): void {
  const usage = analyzeVariableUsage(document)
  for (const name of usage.undefined)
    issue(issues, 'error', 'variable.undefined', `Variable “${name}” is not defined.`)
  for (const name of usage.unused)
    issue(issues, 'info', 'variable.unused', `Variable “${name}” is not used by the design.`)

  if (options.installedFonts) {
    const fonts = new Set(options.installedFonts.map((font) => font.toLocaleLowerCase()))
    const missing = new Map<string, string[]>()
    for (const object of document.template.design.objects)
      if (object.kind === 'text' && !fonts.has(object.fontFamily.toLocaleLowerCase())) {
        const names = missing.get(object.fontFamily) ?? []
        names.push(object.name)
        missing.set(object.fontFamily, names)
      }
    for (const [font, objects] of missing)
      issue(
        issues,
        'error',
        'font.missing',
        `Font “${font}” is unavailable for ${objects.join(', ')}. Barista will substitute Inter; choose a bundled or imported font before printing.`
      )
  }
}

function checkObjects(
  document: LabelDocument,
  issues: PreflightIssue[],
  measureText?: TextMeasurer
): void {
  const { stock } = document.template
  const objects = document.template.design.objects
  const boxes = new Map(objects.map((object) => [object.id, bounds([object])]))
  for (const object of objects) {
    const box = boxes.get(object.id)!
    if (!object.visible) {
      issue(issues, 'info', 'object.hidden', `${object.name} is hidden and will not print.`, object)
      continue
    }
    if (!corners(box).every((point) => insideStock(point, stock)))
      issue(
        issues,
        'error',
        'object.outside-stock',
        `${object.name} extends outside the label stock.`,
        object
      )
    else if (!insideSafeArea(box, stock))
      issue(
        issues,
        'warning',
        'object.outside-safe-area',
        `${object.name} extends outside the safe area.`,
        object
      )

    if (object.kind === 'text') {
      const fit = fitText(object, measureText)
      if (fit.fontSizePt < 6)
        issue(issues, 'warning', 'text.too-small', `${object.name} prints below 6 pt.`, object)
      if (fit.atMinimum)
        issue(
          issues,
          'error',
          'text.fit-minimum',
          `${object.name} still overflows at its ${fit.fontSizePt.toFixed(2)} pt minimum.`,
          object
        )
      else if (fit.overflow)
        issue(issues, 'error', 'text.overflow', `${object.name} overflows its text box.`, object)
      else if (fit.reachedMinimum)
        issue(
          issues,
          'warning',
          'text.fit-minimum',
          `${object.name} has reached its ${fit.fontSizePt.toFixed(2)} pt minimum.`,
          object
        )
    }

    if (object.kind === 'barcode' || object.kind === 'qrcode') {
      const moduleMm = object.kind === 'barcode' ? object.moduleWidthMm : object.moduleSizeMm
      const dots = (moduleMm * stock.dpi) / 25.4
      const minimumDots = object.kind === 'barcode' ? 2 : 1
      if (dots < minimumDots - EPSILON)
        issue(
          issues,
          'error',
          'barcode.module-too-small',
          `${object.name} uses ${dots.toFixed(2)} printer dots per module; at least ${minimumDots} ${minimumDots === 1 ? 'is' : 'are'} required.`,
          object
        )
      if (Math.abs(dots - Math.round(dots)) > 0.02)
        issue(
          issues,
          'warning',
          'barcode.module-dots',
          `${object.name} uses ${dots.toFixed(2)} printer dots per module instead of a whole number.`,
          object
        )
      const quietOkay =
        object.kind === 'barcode'
          ? object.quietZoneMm + EPSILON >= Math.max(1, object.moduleWidthMm * 10)
          : object.quietZoneModules >= 4
      if (!quietOkay)
        issue(
          issues,
          'error',
          'barcode.quiet-zone',
          `${object.name} does not have the minimum quiet zone.`,
          object
        )
      const error = barcodeError(object)
      if (error)
        issue(
          issues,
          'error',
          'barcode.invalid',
          `${object.name} has invalid data: ${error}`,
          object
        )
    }

    if (object.kind === 'image') {
      const asset = document.template.assets.find((candidate) => candidate.id === object.assetId)
      const dimensions = asset
        ? rasterDimensions(asset.mimeType, document.assetData[asset.id] ?? '')
        : null
      if (dimensions) {
        const effectiveDpi = Math.min(
          (dimensions.width * 25.4) / object.widthMm,
          (dimensions.height * 25.4) / object.heightMm
        )
        if (effectiveDpi < stock.dpi * 0.8)
          issue(
            issues,
            'warning',
            'image.low-resolution',
            `${object.name} is ${Math.round(effectiveDpi)} DPI at this size; the label is ${stock.dpi} DPI.`,
            object
          )
      }
    }
  }

  for (const barcode of objects.filter(
    (object) => object.visible && (object.kind === 'barcode' || object.kind === 'qrcode')
  )) {
    const other = objects.find(
      (candidate) =>
        candidate.visible &&
        candidate.id !== barcode.id &&
        intersects(boxes.get(barcode.id)!, boxes.get(candidate.id)!)
    )
    if (other)
      issue(
        issues,
        'error',
        'barcode.overlap',
        `${other.name} overlaps ${barcode.name} and may make it unreadable.`,
        barcode
      )
  }
}

export function preflight(
  document: LabelDocument,
  options: PreflightOptions = {}
): PreflightResult {
  const issues: PreflightIssue[] = []
  if (options.includeTemplateIssues !== false) checkTemplate(document, options, issues)
  const evaluated = evaluatedDocument(document, { ...options, sample: options.sample ?? true })
  for (const error of evaluated.errors) issue(issues, 'error', 'variable.invalid', error)
  checkObjects(evaluated.document, issues, options.measureText)
  return result(issues)
}

export function batchPreflight(
  document: LabelDocument,
  records: readonly BatchPreflightRecord[],
  options: Omit<PreflightOptions, 'fields'> = {}
): BatchPreflightResult {
  const counters = document.template.variables.filter((variable) => variable.kind === 'counter')
  const rows = records.map((record, index): BatchPreflightRow => ({
    key: record.key,
    ...preflight(document, {
      ...options,
      counters: {
        ...options.counters,
        ...Object.fromEntries(
          counters.map((counter) => [counter.name, counterValue(counter, index)])
        )
      },
      fields: record.fields,
      sample: false,
      includeTemplateIssues: false
    })
  }))
  return {
    rows,
    rowsWithErrors: rows.filter((row) => row.errors > 0).length,
    rowsWithWarnings: rows.filter((row) => row.warnings > 0).length,
    totalIssues: rows.reduce((total, row) => total + row.issues.length, 0)
  }
}
