/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { z } from 'zod'
import { BARCODE_SYMBOLOGY_VALUES } from './symbologies'
const finite = z.number().finite()
const dimension = finite.min(0).max(2000)
const color = z.union([
  z.enum(['black', 'white']),
  z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a six-digit hex color')
])
const base = {
  id: z.string().min(1).max(200),
  name: z.string().max(1000),
  xMm: finite.min(-10000).max(10000),
  yMm: finite.min(-10000).max(10000),
  widthMm: dimension,
  heightMm: dimension,
  rotation: finite,
  locked: z.boolean(),
  visible: z.boolean(),
  zIndex: finite,
  groupId: z.string().optional()
}
const shape = { fill: color.nullable(), stroke: color.nullable(), strokeWidthMm: dimension }
export const objectSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('rect'), ...shape, cornerRadiusMm: dimension }),
  z.object({ ...base, kind: z.literal('ellipse'), ...shape }),
  z.object({
    ...base,
    kind: z.literal('line'),
    stroke: color,
    strokeWidthMm: dimension,
    dashMm: z.array(dimension).max(100)
  }),
  z.object({ ...base, kind: z.literal('path'), ...shape, d: z.string().max(100000) }),
  z.object({
    ...base,
    kind: z.literal('text'),
    text: z.string().max(100000),
    fontFamily: z.string().min(1).max(200),
    fontSizePt: finite.min(1).max(1000),
    fontWeight: z.enum(['normal', 'bold']),
    fontStyle: z.enum(['normal', 'italic']),
    align: z.enum(['left', 'center', 'right', 'justify']),
    verticalAlign: z.enum(['top', 'middle', 'bottom']),
    lineHeight: finite.min(0.1).max(10),
    color,
    fitMode: z.enum(['none', 'shrink', 'fit-width', 'wrap']).default('none'),
    minFontSizePt: finite.min(1).max(1000).default(6),
    maxLines: z.number().int().min(1).max(1000).default(3)
  }),
  z.object({
    ...base,
    kind: z.literal('barcode'),
    symbology: z.enum(BARCODE_SYMBOLOGY_VALUES),
    data: z.string().max(10000),
    moduleWidthMm: finite.positive().max(20),
    barHeightMm: dimension,
    quietZoneMm: dimension,
    showHumanReadable: z.boolean(),
    humanReadableFontSizePt: finite.positive().max(1000),
    addCheckDigit: z.boolean(),
    color
  }),
  z.object({
    ...base,
    kind: z.literal('qrcode'),
    symbology: z.enum(['qrcode', 'datamatrix', 'gs1datamatrix', 'gs1qrcode']).optional(),
    data: z.string().max(10000),
    errorCorrection: z.enum(['L', 'M', 'Q', 'H']),
    moduleSizeMm: finite.positive().max(20),
    quietZoneModules: finite.min(0).max(100),
    color
  }),
  z.object({
    ...base,
    kind: z.literal('image'),
    assetId: z.string().min(1),
    fit: z.enum(['contain', 'cover', 'stretch']),
    opacity: finite.min(0).max(1),
    monochrome: z.object({
      enabled: z.boolean(),
      algorithm: z.enum(['threshold', 'floyd-steinberg', 'atkinson']),
      threshold: finite.min(0).max(255),
      invert: z.boolean()
    })
  })
])
const variableBase = {
  id: z.string().min(1).max(200),
  name: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_-]*$/)
    .max(100)
}
export const variableSchema = z.discriminatedUnion('kind', [
  z.object({ ...variableBase, kind: z.literal('fixed'), value: z.string().max(100000) }),
  z.object({
    ...variableBase,
    kind: z.literal('prompt'),
    label: z.string().min(1).max(200),
    defaultValue: z.string().max(10000),
    required: z.boolean(),
    maxLength: z.number().int().min(1).max(10000),
    options: z.array(z.string().max(1000)).max(1000),
    pattern: z.string().max(1000)
  }),
  z.object({
    ...variableBase,
    kind: z.literal('counter'),
    start: z.number().int().safe(),
    step: z
      .number()
      .int()
      .safe()
      .refine((value) => value !== 0, 'Counter step cannot be zero.'),
    padding: z.number().int().min(0).max(100),
    padChar: z.string().length(1),
    prefix: z.string().max(1000),
    suffix: z.string().max(1000),
    scope: z.enum(['template', 'global']),
    sharedName: z.string().max(200),
    format: z.enum(['numeric', 'alphanumeric', 'hex', 'custom']),
    alphabet: z.string().max(200),
    min: z.number().int().safe(),
    max: z.number().int().safe(),
    overflow: z.enum(['wrap', 'stop']),
    reset: z.enum(['never', 'daily', 'monthly', 'yearly']),
    failure: z.enum(['void', 'release'])
  }),
  z.object({
    ...variableBase,
    kind: z.literal('datetime'),
    format: z.string().min(1).max(200),
    offsetDays: z.number().int().min(-100000).max(100000),
    offsetMonths: z.number().int().min(-12000).max(12000),
    offsetYears: z.number().int().min(-1000).max(1000)
  }),
  z.object({
    ...variableBase,
    kind: z.literal('formula'),
    expression: z.string().max(100000)
  }),
  z.object({
    ...variableBase,
    kind: z.literal('field'),
    column: z.string().min(1).max(500),
    sampleValue: z.string().max(100000)
  })
])
export const stockSchema = z
  .object({
    widthMm: dimension.positive(),
    heightMm: dimension.positive(),
    dpi: z.union([z.literal(203), z.literal(300), z.literal(600)]),
    shape: z.enum(['rectangle', 'rounded', 'circle', 'ellipse']),
    cornerRadiusMm: dimension,
    safeAreaMarginMm: dimension,
    gapMm: dimension,
    feed: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('roll') }),
      z.object({
        kind: z.literal('sheet'),
        rows: z.number().int().min(1).max(1000),
        columns: z.number().int().min(1).max(1000),
        pitchXMm: dimension.positive(),
        pitchYMm: dimension.positive(),
        sheetWidthMm: dimension.positive(),
        sheetHeightMm: dimension.positive()
      })
    ]),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/)
  })
  .superRefine((stock, ctx) => {
    if (
      (stock.shape === 'circle' && stock.widthMm !== stock.heightMm) ||
      stock.safeAreaMarginMm * 2 >= Math.min(stock.widthMm, stock.heightMm)
    )
      ctx.addIssue({ code: 'custom', message: 'The stock shape or safe area is invalid.' })
    if (
      stock.feed.kind === 'sheet' &&
      (stock.feed.pitchXMm < stock.widthMm ||
        stock.feed.pitchYMm < stock.heightMm ||
        (stock.feed.columns - 1) * stock.feed.pitchXMm + stock.widthMm > stock.feed.sheetWidthMm ||
        (stock.feed.rows - 1) * stock.feed.pitchYMm + stock.heightMm > stock.feed.sheetHeightMm)
    )
      ctx.addIssue({ code: 'custom', message: 'The labels do not fit the configured sheet.' })
  })

export const templateSchema = z
  .object({
    version: z.literal(2),
    id: z.string().min(1),
    stock: stockSchema,
    variables: z.array(variableSchema).max(1000),
    dataSources: z
      .array(
        z.object({
          id: z.string().min(1).max(512),
          name: z.string().min(1).max(500),
          path: z.string().min(1).max(32768),
          selection: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('sheet'), name: z.string().min(1).max(500) }),
            z.object({ kind: z.literal('table'), name: z.string().min(1).max(500) })
          ]),
          headerRow: z.number().int().min(1).max(1_048_576),
          keyColumn: z.string().min(1).max(500),
          filter: z
            .object({
              column: z.string().min(1).max(500),
              operator: z.enum(['equals', 'not-equals', 'contains', 'starts-with']),
              value: z.string().max(10000)
            })
            .nullable(),
          mappings: z
            .array(
              z.object({
                column: z.string().min(1).max(500),
                variable: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*$/)
              })
            )
            .max(500),
          writeStatusColumn: z.boolean().default(false)
        })
      )
      .max(20)
      .default([]),
    design: z.object({
      guides: z
        .array(
          z.object({
            id: z.string().min(1).max(200),
            axis: z.enum(['x', 'y']),
            positionMm: finite.min(-10000).max(10000),
            locked: z.boolean()
          })
        )
        .max(500)
        .default([]),
      objects: z.array(objectSchema).max(5000)
    }),
    assets: z
      .array(
        z.object({
          id: z.string().min(1),
          fileName: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
          mimeType: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
          byteLength: z.number().int().min(0).max(20000000)
        })
      )
      .max(500),
    fonts: z
      .array(
        z.discriminatedUnion('source', [
          z.object({
            id: z.string().min(1).max(200),
            family: z.string().min(1).max(200),
            license: z.string().min(1).max(200),
            copyright: z.string().max(1000),
            style: z.enum(['normal', 'italic']),
            weight: z.string().regex(/^\d{1,4}( \d{1,4})?$/),
            noSubsetting: z.boolean(),
            source: z.literal('bundled'),
            bundleId: z.string().min(1).max(200)
          }),
          z.object({
            id: z.string().min(1).max(200),
            family: z.string().min(1).max(200),
            license: z.string().min(1).max(200),
            copyright: z.string().max(1000),
            style: z.enum(['normal', 'italic']),
            weight: z.string().regex(/^\d{1,4}( \d{1,4})?$/),
            noSubsetting: z.boolean(),
            source: z.literal('embedded'),
            fileName: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
            mimeType: z.enum(['font/ttf', 'font/otf', 'font/woff2']),
            byteLength: z.number().int().positive().max(20_000_000),
            embedding: z.enum(['installable', 'editable'])
          }),
          z.object({
            id: z.string().min(1).max(200),
            family: z.string().min(1).max(200),
            license: z.string().max(200),
            copyright: z.string().max(1000),
            style: z.enum(['normal', 'italic']),
            weight: z.string().regex(/^\d{1,4}( \d{1,4})?$/),
            noSubsetting: z.boolean(),
            source: z.literal('external'),
            fileName: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
            mimeType: z.enum(['font/ttf', 'font/otf', 'font/woff2']),
            embedding: z.enum(['preview-print', 'restricted', 'bitmap-only'])
          })
        ])
      )
      .max(100)
      .default([]),
    metadata: z.object({
      createdAt: z.string(),
      modifiedAt: z.string(),
      title: z.string().min(1).max(500),
      author: z.string(),
      description: z.string(),
      tags: z.array(z.string().min(1).max(100)).max(100),
      revision: z.number().int().min(1).max(1_000_000),
      status: z.enum(['draft', 'approved'])
    })
  })
  .superRefine((t, ctx) => {
    const ids = new Set(t.design.objects.map((o) => o.id)),
      assets = new Set(t.assets.map((a) => a.id)),
      variableIds = new Set(t.variables.map((v) => v.id)),
      variableNames = new Set(t.variables.map((v) => v.name)),
      dataSourceIds = new Set(t.dataSources.map((source) => source.id)),
      fontIds = new Set(t.fonts.map((font) => font.id))
    if (
      ids.size !== t.design.objects.length ||
      assets.size !== t.assets.length ||
      new Set(t.assets.map((a) => a.fileName)).size !== t.assets.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate object or asset identifiers.' })
    if (variableIds.size !== t.variables.length || variableNames.size !== t.variables.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate variable identifiers or names.' })
    if (dataSourceIds.size !== t.dataSources.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate data source identifiers.' })
    if (fontIds.size !== t.fonts.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate font identifiers.' })
    t.dataSources.forEach((source, sourceIndex) =>
      source.mappings.forEach((mapping, mappingIndex) => {
        if (!variableNames.has(mapping.variable))
          ctx.addIssue({
            code: 'custom',
            message: `Data source mapping references unknown variable "${mapping.variable}".`,
            path: ['dataSources', sourceIndex, 'mappings', mappingIndex, 'variable']
          })
      })
    )
    if (t.variables.some((v) => v.kind === 'counter' && v.min > v.max))
      ctx.addIssue({ code: 'custom', message: 'A counter minimum exceeds its maximum.' })
    if (t.design.objects.some((o) => o.kind === 'image' && !assets.has(o.assetId)))
      ctx.addIssue({ code: 'custom', message: 'An image references a missing asset.' })
  })
export const documentSchema = z
  .object({
    template: templateSchema,
    assetData: z.record(
      z.string(),
      z
        .string()
        .max(28000000)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/)
    ),
    fontData: z
      .record(
        z.string(),
        z
          .string()
          .max(28_000_000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/)
      )
      .default({})
  })

  .refine(
    (d) => Object.values(d.assetData).reduce((total, data) => total + data.length, 0) <= 140000000,
    'Document assets exceed 100 MB.'
  )
  .refine(
    (d) =>
      d.template.assets.every((a) => {
        const data = d.assetData[a.id]
        if (data === undefined) return false
        const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
        return data.length % 4 === 0 && (data.length * 3) / 4 - padding === a.byteLength
      }),
    'Missing or damaged asset bytes.'
  )
  .refine(
    (d) =>
      d.template.fonts.every((font) => {
        if (font.source !== 'embedded') return d.fontData[font.id] === undefined
        const data = d.fontData[font.id]
        if (data === undefined) return false
        const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
        return data.length % 4 === 0 && (data.length * 3) / 4 - padding === font.byteLength
      }),
    'Missing, damaged, or unexpected embedded font bytes.'
  )
