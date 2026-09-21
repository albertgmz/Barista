/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { createDocument, createObject } from '@shared/template/document'
import {
  bindVariable,
  createQuickVariable,
  makeVariableFromSelection,
  uniqueVariableName
} from './variableActions'

describe('variable actions', () => {
  it('creates stable unique variable names', () => {
    expect(uniqueVariableName('Asset number', ['Asset_number'])).toBe('Asset_number2')
    expect(uniqueVariableName('123', [])).toBe('variable')
  })

  it('builds the five quick-create presets', () => {
    expect(createQuickVariable('today', []).kind).toBe('datetime')
    expect(createQuickVariable('future-date', [], 45)).toMatchObject({
      kind: 'datetime',
      offsetDays: 45
    })
    expect(createQuickVariable('serial', []).kind).toBe('counter')
    expect(createQuickVariable('operator', [])).toMatchObject({ kind: 'prompt', required: true })
    expect(createQuickVariable('excel', [], 'Asset Number')).toMatchObject({
      kind: 'field',
      column: 'Asset Number'
    })
  })

  it('appends bindings only to compatible objects', () => {
    expect(bindVariable(createObject('barcode', 0, 0), 'serial')).toMatchObject({
      data: '1234567890{serial}'
    })
    const rect = createObject('rect', 0, 0)
    expect(bindVariable(rect, 'serial')).toBe(rect)
  })

  it('replaces the whole expression in replace mode', () => {
    expect(bindVariable(createObject('barcode', 0, 0), 'serial', 'replace')).toMatchObject({
      data: '{serial}'
    })
    expect(bindVariable(createObject('text', 0, 0), 'serial', 'replace')).toMatchObject({
      text: '{serial}'
    })
    expect(bindVariable(createObject('text', 0, 0), 'serial', 'append')).toMatchObject({
      text: 'Text{serial}'
    })
  })

  it('turns selected text into a fixed variable and binding', () => {
    const document = createDocument()
    const text = createObject('text', 0, 0)
    if (text.kind !== 'text') throw new Error('Expected text')
    text.text = 'Asset D530 ready'
    document.template.design.objects.push(text)
    const result = makeVariableFromSelection(document, text.id, 6, 10, 'equipment')
    expect(result.template.variables[0]).toMatchObject({
      name: 'equipment',
      kind: 'fixed',
      value: 'D530'
    })
    expect(result.template.design.objects[0]).toMatchObject({ text: 'Asset {equipment} ready' })
  })
})
