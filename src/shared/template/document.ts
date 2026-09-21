/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelDocument, LabelObject, LabelStock, ObjectKind } from './types'
import { roundMm } from '../units'
let sequence = 0
export function newId(): string {
  return `${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}`
}
export const DEFAULT_STOCK: LabelStock = {
  widthMm: 60,
  heightMm: 35,
  dpi: 300,
  shape: 'rectangle',
  cornerRadiusMm: 0,
  safeAreaMarginMm: 2,
  gapMm: 3,
  feed: { kind: 'roll' },
  backgroundColor: '#ffffff'
}

export function createDocument(
  stock: LabelStock = DEFAULT_STOCK,
  title = 'Untitled'
): LabelDocument {
  const now = new Date().toISOString()
  return {
    template: {
      version: 2,
      id: newId(),
      stock: structuredClone(stock),
      design: { objects: [], guides: [] },
      assets: [],
      fonts: [],
      variables: [],
      dataSources: [],
      metadata: {
        createdAt: now,
        modifiedAt: now,
        title,
        author: '',
        description: '',
        tags: [],
        revision: 1,
        status: 'draft'
      }
    },
    assetData: {},
    fontData: {}
  }
}
export function createObject(kind: ObjectKind, xMm: number, yMm: number): LabelObject {
  const base = {
    id: newId(),
    name: kind,
    xMm,
    yMm,
    widthMm: 20,
    heightMm: 10,
    rotation: 0,
    locked: false,
    visible: true,
    zIndex: 0
  }
  switch (kind) {
    case 'text':
      return {
        ...base,
        kind,
        widthMm: 30,
        // Tall enough for two wrapped 12 pt lines, so a new box that wraps is
        // not reported as overflowing the moment a second line appears.
        heightMm: 10,
        text: 'Text',
        fontFamily: 'Inter',
        fontSizePt: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        align: 'left',
        verticalAlign: 'top',
        lineHeight: 1.16,
        color: '#000000',
        fitMode: 'wrap',
        minFontSizePt: 6,
        maxLines: 3
      }
    case 'barcode':
      return {
        ...base,
        kind,
        widthMm: 30,
        symbology: 'code128',
        data: '1234567890',
        moduleWidthMm: 0.254,
        barHeightMm: 8,
        quietZoneMm: 2.54,
        showHumanReadable: true,
        humanReadableFontSizePt: 8,
        addCheckDigit: true,
        color: '#000000'
      }
    case 'qrcode':
      return {
        ...base,
        kind,
        widthMm: 15,
        heightMm: 15,
        data: 'https://example.com',
        symbology: 'qrcode',
        errorCorrection: 'M',
        moduleSizeMm: 0.508,
        quietZoneModules: 4,
        color: '#000000'
      }
    case 'image':
      return {
        ...base,
        kind,
        assetId: '',
        fit: 'contain',
        opacity: 1,
        monochrome: { enabled: false, algorithm: 'threshold', threshold: 128, invert: false }
      }
    case 'rect':
      return { ...base, kind, fill: null, stroke: '#000000', strokeWidthMm: 0.3, cornerRadiusMm: 0 }
    case 'ellipse':
      return { ...base, kind, fill: null, stroke: '#000000', strokeWidthMm: 0.3 }
    case 'line':
      return { ...base, kind, heightMm: 0.1, stroke: '#000000', strokeWidthMm: 0.3, dashMm: [] }
    case 'path':
      return { ...base, kind, d: '', fill: null, stroke: '#000000', strokeWidthMm: 0.3 }
  }
}
export type ObjectPatch = Partial<
  {
    [K in LabelObject['kind']]: Omit<Extract<LabelObject, { kind: K }>, 'kind' | 'id'>
  }[LabelObject['kind']]
>
export function bounds(objects: readonly LabelObject[]): {
  x: number
  y: number
  width: number
  height: number
} {
  const points = objects.flatMap((o) => {
    const a = (o.rotation * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a)
    return [-1, 1].flatMap((x) =>
      [-1, 1].map((y) => ({
        x: o.xMm + o.widthMm / 2 + ((x * o.widthMm) / 2) * c - ((y * o.heightMm) / 2) * s,
        y: o.yMm + o.heightMm / 2 + ((x * o.widthMm) / 2) * s + ((y * o.heightMm) / 2) * c
      }))
    )
  })
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y))
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y
  }
}

/** Keeps an object's rotated visual bounds within the physical label stock. */
export function constrainObjectToStock(object: LabelObject, stock: LabelStock): LabelObject {
  let candidate = { ...object }
  let box = bounds([candidate])
  const scale = Math.min(
    1,
    stock.widthMm / Math.max(box.width, 0.001),
    stock.heightMm / Math.max(box.height, 0.001)
  )
  if (scale < 1) {
    const centerX = candidate.xMm + candidate.widthMm / 2
    const centerY = candidate.yMm + candidate.heightMm / 2
    candidate = {
      ...candidate,
      widthMm: candidate.widthMm * scale,
      heightMm: candidate.heightMm * scale,
      xMm: centerX - (candidate.widthMm * scale) / 2,
      yMm: centerY - (candidate.heightMm * scale) / 2
    }
    box = bounds([candidate])
  }
  const dx = box.x < 0 ? -box.x : Math.min(0, stock.widthMm - box.x - box.width)
  const dy = box.y < 0 ? -box.y : Math.min(0, stock.heightMm - box.y - box.height)
  return { ...candidate, xMm: candidate.xMm + dx, yMm: candidate.yMm + dy } as LabelObject
}

const MM_KEYS = new Set([
  'xMm',
  'yMm',
  'widthMm',
  'heightMm',
  'strokeWidthMm',
  'cornerRadiusMm',
  'moduleWidthMm',
  'moduleSizeMm',
  'barHeightMm',
  'quietZoneMm'
])

/** Quantizes all stored physical geometry to 0.001 mm. */
export function quantizeDocumentGeometry(document: LabelDocument): LabelDocument {
  const quantizeObject = (object: LabelObject): LabelObject => {
    const copy = { ...object } as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(copy))
      if (MM_KEYS.has(key) && typeof value === 'number') copy[key] = roundMm(value)
    if (object.kind === 'line') copy['dashMm'] = object.dashMm.map((value) => roundMm(value))
    return copy as unknown as LabelObject
  }
  return {
    ...document,
    template: {
      ...document.template,
      stock: {
        ...document.template.stock,
        widthMm: roundMm(document.template.stock.widthMm),
        heightMm: roundMm(document.template.stock.heightMm),
        cornerRadiusMm: roundMm(document.template.stock.cornerRadiusMm),
        safeAreaMarginMm: roundMm(document.template.stock.safeAreaMarginMm),
        gapMm: roundMm(document.template.stock.gapMm),
        feed:
          document.template.stock.feed.kind === 'roll'
            ? document.template.stock.feed
            : {
                ...document.template.stock.feed,
                pitchXMm: roundMm(document.template.stock.feed.pitchXMm),
                pitchYMm: roundMm(document.template.stock.feed.pitchYMm),
                sheetWidthMm: roundMm(document.template.stock.feed.sheetWidthMm),
                sheetHeightMm: roundMm(document.template.stock.feed.sheetHeightMm)
              }
      },
      design: {
        objects: document.template.design.objects.map(quantizeObject),
        guides: document.template.design.guides.map((guide) => ({
          ...guide,
          positionMm: roundMm(guide.positionMm)
        }))
      }
    }
  }
}
