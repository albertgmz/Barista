/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { createObject } from '@shared/template/document'
import { fitText } from '@shared/textFit'
import type { TextObject } from '@shared/template/types'
import { commitPatch } from './commitPatch'

const textObject = (): TextObject => {
  const object = createObject('text', 4, 6)
  if (object.kind !== 'text') throw new Error('Expected text')
  return object
}

const geometry = {
  centerXMm: 20,
  centerYMm: 10,
  widthMm: 30,
  heightMm: 6,
  rotation: 0
}

describe('canvas commit patch', () => {
  it('rebases the box onto its top-left corner', () => {
    expect(commitPatch({ objectId: 'a', kind: 'rect', geometry }, null)).toEqual({
      xMm: 5,
      yMm: 7,
      widthMm: 30,
      heightMm: 6,
      rotation: 0
    })
  })

  it('preserves the source text through a move-only gesture', () => {
    const object = textObject()
    object.text = '{variable1} chilled almond milk latte with two extra shots and vanilla syrup'
    const fit = fitText(object)
    const canvasText = fit.lines.join('\n')
    expect(canvasText).not.toBe(object.text)

    const moved = {
      ...object,
      ...commitPatch(
        {
          objectId: object.id,
          kind: 'text',
          geometry,
          canvasText,
          contentHeightMm: fit.heightMm
        },
        null
      )
    }
    expect(moved.text).toBe(
      '{variable1} chilled almond milk latte with two extra shots and vanilla syrup'
    )
    expect(moved.xMm).toBe(5)
    expect(moved.yMm).toBe(7)
    expect(moved.heightMm).toBe(geometry.heightMm)
  })

  it('grows the box to the height the typed text needs', () => {
    const object = textObject()
    const patch = commitPatch(
      {
        objectId: object.id,
        kind: 'text',
        geometry,
        canvasText: 'Edited on canvas',
        contentHeightMm: 14.5
      },
      object.id
    )
    // The box grows downwards: a top-anchored line must not shift while typing.
    expect(patch).toMatchObject({ heightMm: 14.5, yMm: geometry.centerYMm - geometry.heightMm / 2 })
  })

  it('leaves a box that already fits the typed text alone', () => {
    const object = textObject()
    const patch = commitPatch(
      {
        objectId: object.id,
        kind: 'text',
        geometry,
        canvasText: 'Edited on canvas',
        contentHeightMm: 2
      },
      object.id
    )
    expect(patch).toMatchObject({ heightMm: geometry.heightMm })
  })

  // Fabric never breaks a word: a textbox holding one wider than its box widens
  // itself to fit it, so the canvas measurement is not the box the user sized.
  const widened = { ...geometry, widthMm: 59.265 }

  it('keeps the width of the box through an inline edit', () => {
    const object = textObject()
    const patch = commitPatch(
      {
        objectId: object.id,
        kind: 'text',
        geometry: widened,
        boxWidthMm: geometry.widthMm,
        canvasText: 'Antidisestablishmentarianism',
        contentHeightMm: 4
      },
      object.id
    )
    // The box widens about its centre, so a width left alone leaves X alone.
    expect(patch).toMatchObject({ widthMm: 30, xMm: 5 })
  })

  it('writes the width a resize handle produced', () => {
    const object = textObject()
    const patch = commitPatch(
      { objectId: object.id, kind: 'text', geometry: widened, boxWidthMm: 24 },
      null
    )
    expect(patch).toMatchObject({ widthMm: 24, xMm: 8 })
  })

  it('preserves the source text of every object but the one being edited', () => {
    const object = textObject()
    object.text = '{variable1}'
    const patch = commitPatch(
      { objectId: object.id, kind: 'text', geometry, canvasText: 'ACME-001' },
      'another-object'
    )
    expect(patch).not.toHaveProperty('text')
  })

  it('writes the edited string back for the object that was inline edited', () => {
    const object = textObject()
    const patch = commitPatch(
      { objectId: object.id, kind: 'text', geometry, canvasText: 'Edited on canvas' },
      object.id
    )
    expect(patch).toMatchObject({ text: 'Edited on canvas' })
  })

  it('never writes text onto a non-text object drawn as a textbox', () => {
    const patch = commitPatch(
      { objectId: 'b', kind: 'barcode', geometry, canvasText: 'Invalid barcode' },
      'b'
    )
    expect(patch).not.toHaveProperty('text')
  })
})
