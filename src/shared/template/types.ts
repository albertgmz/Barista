/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Type definitions for the `.bar` label document stored in `label.json`.
 *
 * A `.bar` file is a ZIP archive containing a versioned manifest, this label
 * document and content-addressed assets.
 *
 * Geometry convention: every position and size in this format is expressed in
 * millimetres, with the origin at the top-left corner of the label and the
 * y-axis pointing down. Font sizes (points) and rotation (degrees) are the
 * only exceptions.
 */

import type { BarcodeSymbology } from './symbologies'

/** Schema version written into `label.json`. Bump on breaking changes. */
export const TEMPLATE_FORMAT_VERSION = 2

/** Physical dimensions of the label stock. */
export type StockShape = 'rectangle' | 'rounded' | 'circle' | 'ellipse'

export type StockFeed =
  | { kind: 'roll' }
  | {
      kind: 'sheet'
      rows: number
      columns: number
      pitchXMm: number
      pitchYMm: number
      sheetWidthMm: number
      sheetHeightMm: number
    }

export interface LabelStock {
  widthMm: number
  heightMm: number
  /** Target print resolution, used to rasterize barcodes and images. */
  dpi: number
  shape: StockShape
  cornerRadiusMm: number
  safeAreaMarginMm: number
  gapMm: number
  feed: StockFeed
  backgroundColor: string
}

/* -------------------------------------------------------------------------- */
/* Variables                                                                  */
/* -------------------------------------------------------------------------- */

export type VariableKind = 'fixed' | 'prompt' | 'counter' | 'datetime' | 'formula' | 'field'

interface VariableBase {
  id: string
  /** Identifier used inside data expressions, e.g. the `equipo` in `{equipo}`. */
  name: string
  kind: VariableKind
}

/** A constant value stored with the template. */
export interface FixedVariable extends VariableBase {
  kind: 'fixed'
  value: string
}

/** A value the operator is asked for at print time. */
export interface PromptVariable extends VariableBase {
  kind: 'prompt'
  label: string
  defaultValue: string
  required: boolean
  maxLength: number
  options: string[]
  pattern: string
}

/** An auto-incrementing serial number. */
export interface CounterVariable extends VariableBase {
  kind: 'counter'
  start: number
  step: number
  /** Minimum digit count; shorter values are left-padded with `padChar`. */
  padding: number
  padChar: string
  /** Affixes applied after padding, so `SN-` + `000042` yields `SN-000042`. */
  prefix: string
  suffix: string
  /**
   * Where the counter's current value lives between print runs.
   * `template` persists independently; `global` can share a named sequence.
   */
  scope: 'template' | 'global'
  /** Global counters may share a stable name across templates. */
  sharedName: string
  format: 'numeric' | 'alphanumeric' | 'hex' | 'custom'
  alphabet: string
  min: number
  max: number
  overflow: 'wrap' | 'stop'
  reset: 'never' | 'daily' | 'monthly' | 'yearly'
  /** Whether a failed print burns its reserved values or makes them reusable. */
  failure: 'void' | 'release'
}

/** The current date/time rendered with a format pattern. */
export interface DateTimeVariable extends VariableBase {
  kind: 'datetime'
  /** Format pattern, e.g. `yyyy-MM-dd HH:mm`. */
  format: string
  /** Days added to the current date; used for expiry dates. */
  offsetDays: number
  offsetMonths: number
  offsetYears: number
}

/** A value computed from other variables. */
export interface FormulaVariable extends VariableBase {
  kind: 'formula'
  /** Expression over other variables, e.g. `{equipo} + "-" + {serial}`. */
  expression: string
}

/** A column supplied by the active spreadsheet/data-source record. */
export interface FieldVariable extends VariableBase {
  kind: 'field'
  column: string
  sampleValue: string
}

export type LabelVariable =
  | FixedVariable
  | PromptVariable
  | CounterVariable
  | DateTimeVariable
  | FormulaVariable
  | FieldVariable

/* -------------------------------------------------------------------------- */
/* Objects                                                                    */
/* -------------------------------------------------------------------------- */

export type ObjectKind =
  'text' | 'barcode' | 'qrcode' | 'image' | 'path' | 'rect' | 'line' | 'ellipse'

/**
 * Properties shared by every drawable object. `xMm`/`yMm` are the top-left
 * corner of the unrotated bounding box; rotation pivots around its centre.
 */
export interface LabelObjectBase {
  id: string
  /** Human-readable name shown in the Layers panel. */
  name: string
  kind: ObjectKind
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
  /** Clockwise rotation in degrees. */
  rotation: number
  locked: boolean
  visible: boolean
  /** Paint order; higher values are drawn on top. */
  groupId?: string
  zIndex: number
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type VerticalAlign = 'top' | 'middle' | 'bottom'
export type TextFitMode = 'none' | 'shrink' | 'fit-width' | 'wrap'

export interface TextObject extends LabelObjectBase {
  kind: 'text'
  /** Data expression; `{name}` placeholders resolve against the variables. */
  text: string
  fontFamily: string
  /** Font size in typographic points. */
  fontSizePt: number
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  align: TextAlign
  verticalAlign: VerticalAlign
  /** Multiplier applied to the font size. */
  lineHeight: number
  color: string
  fitMode: TextFitMode
  minFontSizePt: number
  maxLines: number
}

/** 1D symbologies supported by the barcode object, defined in `symbologies.ts`. */
export type { BarcodeSymbology }

export interface BarcodeObject extends LabelObjectBase {
  kind: 'barcode'
  symbology: BarcodeSymbology
  /** Data expression, e.g. `{equipo}{serial}`. */
  data: string
  /** Width of the narrowest bar, which drives the barcode density. */
  moduleWidthMm: number
  barHeightMm: number
  quietZoneMm: number
  showHumanReadable: boolean
  humanReadableFontSizePt: number
  /** Append a symbology-specific check digit when the data omits it. */
  addCheckDigit: boolean
  color: string
}

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H'

export interface QrCodeObject extends LabelObjectBase {
  kind: 'qrcode'
  /** Data expression, e.g. `{equipo}{serial}`. */
  data: string
  symbology?: 'qrcode' | 'datamatrix' | 'gs1datamatrix' | 'gs1qrcode'
  errorCorrection: QrErrorCorrection
  /** Edge length of one QR module, which sets the rendered symbol size. */
  moduleSizeMm: number
  quietZoneModules: number
  color: string
}

export type ImageFit = 'contain' | 'cover' | 'stretch'
export type DitherAlgorithm = 'threshold' | 'floyd-steinberg' | 'atkinson'

/** Conversion to 1-bit black and white, as thermal printers require. */
export interface MonochromeOptions {
  enabled: boolean
  algorithm: DitherAlgorithm
  /** Luminance cut-off in the range 0-255, used by `threshold`. */
  threshold: number
  invert: boolean
}

export interface ImageObject extends LabelObjectBase {
  kind: 'image'
  /** References {@link AssetRef.id} inside the archive's `assets/` folder. */
  assetId: string
  fit: ImageFit
  monochrome: MonochromeOptions
  /** Range 0-1. */
  opacity: number
}

export interface PathObject extends LabelObjectBase {
  kind: 'path'
  /** SVG path data in millimetres, relative to the object's origin. */
  d: string
  fill: string | null
  stroke: string | null
  strokeWidthMm: number
}

export interface EllipseObject extends LabelObjectBase {
  kind: 'ellipse'
  fill: string | null
  stroke: string | null
  strokeWidthMm: number
}

export interface RectObject extends LabelObjectBase {
  kind: 'rect'
  fill: string | null
  stroke: string | null
  strokeWidthMm: number
  cornerRadiusMm: number
}

/**
 * A straight line drawn along the diagonal of the object's bounding box,
 * from (`xMm`, `yMm`) to (`xMm` + `widthMm`, `yMm` + `heightMm`).
 */
export interface LineObject extends LabelObjectBase {
  kind: 'line'
  stroke: string
  strokeWidthMm: number
  /** Dash pattern in millimetres; an empty array means a solid line. */
  dashMm: number[]
}

export type LabelObject =
  | TextObject
  | BarcodeObject
  | QrCodeObject
  | ImageObject
  | PathObject
  | RectObject
  | LineObject
  | EllipseObject

/** Narrows {@link LabelObject} by its `kind` discriminant. */
export type LabelObjectOfKind<K extends ObjectKind> = Extract<LabelObject, { kind: K }>

/* -------------------------------------------------------------------------- */
/* Template                                                                   */
/* -------------------------------------------------------------------------- */

/** A binary file stored under `assets/` in the `.bar` archive. */
export interface AssetRef {
  id: string
  /** Path relative to the archive's `assets/` folder. */
  fileName: string
  mimeType: string
  byteLength: number
}

export type FontFileMimeType = 'font/ttf' | 'font/otf' | 'font/woff2'

export type FontEmbeddingPermission =
  'installable' | 'editable' | 'preview-print' | 'restricted' | 'bitmap-only'

interface FontReferenceBase {
  id: string
  family: string
  license: string
  copyright: string
  style: 'normal' | 'italic'
  weight: string
  noSubsetting: boolean
}

export type FontReference =
  | (FontReferenceBase & {
      source: 'bundled'
      bundleId: string
    })
  | (FontReferenceBase & {
      source: 'embedded'
      fileName: string
      mimeType: FontFileMimeType
      byteLength: number
      embedding: 'installable' | 'editable'
    })
  | (FontReferenceBase & {
      source: 'external'
      fileName: string
      mimeType: FontFileMimeType
      embedding: Exclude<FontEmbeddingPermission, 'installable' | 'editable'>
    })

export interface TemplateMetadata {
  /** ISO-8601 timestamp. */
  createdAt: string
  /** ISO-8601 timestamp. */
  modifiedAt: string
  title: string
  author: string
  description: string
  tags: string[]
  revision: number
  status: 'draft' | 'approved'
}

export interface LabelGuide {
  id: string
  axis: 'x' | 'y'
  positionMm: number
  locked: boolean
}

export interface DataSourceFieldMapping {
  column: string
  variable: string
}

export interface DataSourceFilter {
  column: string
  operator: 'equals' | 'not-equals' | 'contains' | 'starts-with'
  value: string
}

export type DataSourceSelection = { kind: 'sheet'; name: string } | { kind: 'table'; name: string }

/** A read-only spreadsheet source stored in the label definition. */
export interface DataSourceDefinition {
  id: string
  name: string
  /** Absolute, or relative to the containing `.bar` file. */
  path: string
  selection: DataSourceSelection
  /** One-based row number. Named tables normally use their first row. */
  headerRow: number
  keyColumn: string
  filter: DataSourceFilter | null
  mappings: DataSourceFieldMapping[]
  /** Deliberately false by default; write-back is not implemented in 0.3. */
  writeStatusColumn: boolean
}

export interface LabelTemplate {
  /** Matches {@link TEMPLATE_FORMAT_VERSION} at the time of writing. */
  version: number
  id: string
  stock: LabelStock
  design: {
    guides: LabelGuide[]
    objects: LabelObject[]
  }
  variables: LabelVariable[]
  dataSources: DataSourceDefinition[]
  assets: AssetRef[]
  fonts: FontReference[]
  metadata: TemplateMetadata
}

/** Asset bytes travel as base64, separately from the on-disk manifest. */
export interface LabelDocument {
  template: LabelTemplate
  assetData: Record<string, string>
  /** Full font bytes for references whose source is `embedded`. */
  fontData: Record<string, string>
}
