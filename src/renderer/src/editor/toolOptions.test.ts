/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { toolOptionsLayout } from './toolOptions'

describe('tool options layout', () => {
  it('shows the controls for the active tool when nothing is selected', () => {
    expect(toolOptionsLayout([], 'text')).toMatchObject({ title: 'Text', groups: ['text'] })
    expect(toolOptionsLayout([], 'image').groups).toEqual(['image'])
    expect(toolOptionsLayout([], 'rect').groups).toEqual(['shape'])
    expect(toolOptionsLayout([], 'ellipse').groups).toEqual(['shape'])
    expect(toolOptionsLayout([], 'line').groups).toEqual(['shape'])
    expect(toolOptionsLayout([], 'pen').groups).toEqual(['shape'])
  })
  it('offers the placement hint for tools without defaults', () => {
    for (const tool of ['select', 'barcode', 'qrcode'] as const) {
      const layout = toolOptionsLayout([], tool)
      expect(layout.groups).toEqual([])
      expect(layout.hint).toBe('Click or drag on the label to place an object.')
    }
    expect(toolOptionsLayout([], 'text').hint).toBeNull()
  })
  it('gives a selected object its own controls and its position fields', () => {
    // The previous chain tested "anything selected" before the object kind, so
    // every one of these showed the position fields alone.
    expect(toolOptionsLayout(['text'], 'select')).toMatchObject({
      title: 'Text',
      groups: ['text', 'position']
    })
    expect(toolOptionsLayout(['image'], 'select').groups).toEqual(['image', 'position'])
    expect(toolOptionsLayout(['rect'], 'select').groups).toEqual(['shape', 'position'])
    expect(toolOptionsLayout(['ellipse'], 'select').groups).toEqual(['shape', 'position'])
    expect(toolOptionsLayout(['line'], 'select').groups).toEqual(['shape', 'position'])
    expect(toolOptionsLayout(['path'], 'select').groups).toEqual(['shape', 'position'])
    expect(toolOptionsLayout(['barcode'], 'select').groups).toEqual(['barcode', 'position'])
    expect(toolOptionsLayout(['qrcode'], 'select').groups).toEqual(['position'])
  })
  it('ignores the active tool while a selection exists', () => {
    expect(toolOptionsLayout(['rect'], 'text').groups).toEqual(['shape', 'position'])
    expect(toolOptionsLayout(['text'], 'rect').groups).toEqual(['text', 'position'])
  })
  it('names a multiple selection and keeps kind controls only when it agrees', () => {
    expect(toolOptionsLayout(['text', 'text'], 'select')).toMatchObject({
      title: '2 × Text',
      groups: ['text', 'position']
    })
    expect(toolOptionsLayout(['text', 'rect'], 'select')).toMatchObject({
      title: '2 objects',
      groups: ['position']
    })
  })
})
