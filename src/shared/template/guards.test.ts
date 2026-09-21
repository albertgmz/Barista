/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { isLabelObject, isLabelStock, isLabelTemplate, isLabelVariable } from './guards'
import { TEMPLATE_FORMAT_VERSION } from './types'
import type { LabelTemplate } from './types'
import { DEFAULT_STOCK } from './document'

function validTemplate(): LabelTemplate {
  return {
    version: TEMPLATE_FORMAT_VERSION,
    id: 'tpl-1',
    stock: DEFAULT_STOCK,
    variables: [{ id: 'v1', name: 'equipo', kind: 'fixed', value: 'EQ' }],
    dataSources: [],
    design: {
      guides: [],
      objects: [
        {
          id: 'o1',
          name: 'Serial',
          kind: 'barcode',
          xMm: 4,
          yMm: 4,
          widthMm: 50,
          heightMm: 15,
          rotation: 0,
          locked: false,
          visible: true,
          zIndex: 0,
          symbology: 'code128',
          data: '{equipo}{serial}',
          moduleWidthMm: 0.25,
          barHeightMm: 12,
          quietZoneMm: 2,
          showHumanReadable: true,
          humanReadableFontSizePt: 8,
          addCheckDigit: true,
          color: '#000000'
        }
      ]
    },
    assets: [],
    fonts: [],
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      title: 'Equipment label',
      author: '',
      description: '',
      tags: [],
      revision: 1,
      status: 'draft'
    }
  }
}

describe('isLabelStock', () => {
  it('accepts positive finite dimensions', () => {
    expect(isLabelStock(DEFAULT_STOCK)).toBe(true)
  })

  it('rejects a zero or negative dimension', () => {
    expect(isLabelStock({ widthMm: 0, heightMm: 35, dpi: 300 })).toBe(false)
    expect(isLabelStock({ widthMm: 60, heightMm: -35, dpi: 300 })).toBe(false)
  })

  it('rejects NaN, which JSON.parse can produce from a malformed number', () => {
    expect(isLabelStock({ widthMm: Number.NaN, heightMm: 35, dpi: 300 })).toBe(false)
  })
})

describe('isLabelVariable', () => {
  it('accepts a known variable kind', () => {
    expect(isLabelVariable({ id: 'v1', name: 'serial', kind: 'counter' })).toBe(true)
  })

  it('rejects an unknown kind', () => {
    expect(isLabelVariable({ id: 'v1', name: 'serial', kind: 'lookup' })).toBe(false)
  })

  it('rejects an empty name, which could not be referenced in an expression', () => {
    expect(isLabelVariable({ id: 'v1', name: '', kind: 'fixed' })).toBe(false)
  })
})

describe('isLabelObject', () => {
  it('accepts a well-formed object', () => {
    expect(isLabelObject(validTemplate().design.objects[0])).toBe(true)
  })

  it('rejects an unknown kind', () => {
    expect(
      isLabelObject({ id: 'o1', kind: 'hologram', xMm: 0, yMm: 0, widthMm: 1, heightMm: 1 })
    ).toBe(false)
  })

  it('rejects non-finite geometry', () => {
    expect(
      isLabelObject({
        id: 'o1',
        kind: 'rect',
        xMm: Number.POSITIVE_INFINITY,
        yMm: 0,
        widthMm: 1,
        heightMm: 1,
        rotation: 0,
        zIndex: 0
      })
    ).toBe(false)
  })

  it('rejects an object missing rotation or zIndex, which the renderers read', () => {
    const { rotation: _rotation, ...noRotation } = validTemplate().design.objects[0]!
    expect(isLabelObject(noRotation)).toBe(false)

    const { zIndex: _zIndex, ...noZIndex } = validTemplate().design.objects[0]!
    expect(isLabelObject(noZIndex)).toBe(false)
  })
})

describe('isLabelTemplate', () => {
  it('accepts a valid template', () => {
    expect(isLabelTemplate(validTemplate())).toBe(true)
  })

  it('accepts an empty label with no variables or objects', () => {
    expect(
      isLabelTemplate({ ...validTemplate(), variables: [], design: { guides: [], objects: [] } })
    ).toBe(true)
  })

  it('rejects a version this build does not understand', () => {
    expect(isLabelTemplate({ ...validTemplate(), version: TEMPLATE_FORMAT_VERSION + 1 })).toBe(
      false
    )
    expect(isLabelTemplate({ ...validTemplate(), version: 0 })).toBe(false)
  })

  it('rejects a template whose object list holds something malformed', () => {
    expect(
      isLabelTemplate({ ...validTemplate(), design: { guides: [], objects: [{ id: 'broken' }] } })
    ).toBe(false)
  })

  it('rejects a template missing the required assets or metadata', () => {
    const { assets: _assets, ...noAssets } = validTemplate()
    expect(isLabelTemplate(noAssets)).toBe(false)

    const { metadata: _metadata, ...noMetadata } = validTemplate()
    expect(isLabelTemplate(noMetadata)).toBe(false)
  })

  it('rejects an assets entry that could not be resolved to a file', () => {
    expect(isLabelTemplate({ ...validTemplate(), assets: [{ id: 'a1' }] })).toBe(false)
  })

  it('rejects values that are not objects at all', () => {
    expect(isLabelTemplate(null)).toBe(false)
    expect(isLabelTemplate('{}')).toBe(false)
    expect(isLabelTemplate([])).toBe(false)
  })
})
