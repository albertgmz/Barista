/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { createDocument, createObject } from '@shared/template/document'
import type { LabelDocument, LabelVariable } from '@shared/template/types'
import { evaluateVariables } from '@shared/variables'
import {
  applyDataSource,
  classifyDataSource,
  dataSourcePreview,
  variablesForSource
} from './dataSource'
import { createQuickVariable } from './variableActions'

function documentWith(
  kind: 'text' | 'barcode',
  expression: string,
  variables: LabelVariable[] = []
): { document: LabelDocument; objectId: string } {
  const document = createDocument()
  const object = createObject(kind, 0, 0)
  if (object.kind === 'text') object.text = expression
  if (object.kind === 'barcode') object.data = expression
  document.template.design.objects.push(object)
  document.template.variables.push(...variables)
  return { document, objectId: object.id }
}

const expressionOf = (document: LabelDocument): string => {
  const object = document.template.design.objects[0]
  if (!object) throw new Error('Expected an object')
  if (object.kind === 'text') return object.text
  if (object.kind === 'barcode') return object.data
  throw new Error('Expected a data-carrying object')
}

describe('data source classification', () => {
  const serial = createQuickVariable('serial', [])
  const operator = createQuickVariable('operator', [])
  const column = createQuickVariable('excel', [], 'Column')

  it('reads literal text as a fixed source', () => {
    expect(classifyDataSource('1234567890', [serial])).toEqual({ state: 'fixed', variable: null })
    expect(classifyDataSource('', [])).toEqual({ state: 'fixed', variable: null })
  })

  it('reads a lone placeholder as its variable kind', () => {
    expect(classifyDataSource('{serial}', [serial])).toEqual({ state: 'counter', variable: serial })
    expect(classifyDataSource('{operator}', [operator])).toMatchObject({ state: 'prompt' })
    expect(classifyDataSource('{Column}', [column])).toMatchObject({ state: 'field' })
  })

  it('reads a fixed or formula variable as the generic variable source', () => {
    const fixed: LabelVariable = { id: 'v1', name: 'plant', kind: 'fixed', value: 'Madrid' }
    expect(classifyDataSource('{plant}', [fixed])).toEqual({ state: 'variable', variable: fixed })
  })

  it('reads mixed, repeated and unknown placeholders as a custom expression', () => {
    expect(classifyDataSource('SN-{serial}', [serial])).toEqual({ state: 'custom', variable: null })
    expect(classifyDataSource('{serial}{serial}', [serial])).toMatchObject({ state: 'custom' })
    expect(classifyDataSource('{missing}', [serial])).toMatchObject({ state: 'custom' })
  })

  it('follows the evaluator about what counts as a placeholder', () => {
    // `{ serial }` is not a token, so the evaluator prints it literally and
    // this is genuinely fixed text; padding around a real token is not.
    expect(classifyDataSource('{ serial }', [serial])).toMatchObject({ state: 'fixed' })
    expect(classifyDataSource('{Serial}', [serial])).toMatchObject({ state: 'custom' })
    expect(classifyDataSource(' {serial}', [serial])).toMatchObject({ state: 'custom' })
    expect(classifyDataSource('{serial} ', [serial])).toMatchObject({ state: 'custom' })
  })
})

describe('source candidates', () => {
  const serial = createQuickVariable('serial', [])
  const today = createQuickVariable('today', [serial.name])

  it('offers each variable under exactly one source', () => {
    expect(variablesForSource('counter', [serial, today])).toEqual([serial])
    expect(variablesForSource('variable', [serial, today])).toEqual([today])
    expect(variablesForSource('prompt', [serial, today])).toEqual([])
    expect(variablesForSource('fixed', [serial, today])).toEqual([])
  })
})

describe('applying a data source', () => {
  it('replaces the expression instead of appending to it', () => {
    const serial = createQuickVariable('serial', [])
    const { document, objectId } = documentWith('barcode', '1234567890', [serial])
    const next = applyDataSource(document, objectId, { source: 'counter' })
    expect(expressionOf(next)).toBe('{serial}')
    expect(next.template.variables).toHaveLength(1)
  })

  it('creates a valid counter variable when none exists', () => {
    const { document, objectId } = documentWith('barcode', '1234567890')
    const next = applyDataSource(document, objectId, { source: 'counter' })
    const created = next.template.variables[0]
    expect(created).toMatchObject({
      name: 'serial',
      kind: 'counter',
      start: 1,
      step: 1,
      padding: 4,
      padChar: '0',
      format: 'numeric',
      overflow: 'stop'
    })
    expect(expressionOf(next)).toBe('{serial}')
    expect(evaluateVariables(next.template.variables, { sample: true }).errors).toEqual([])
  })

  it('reuses the bound variable when its kind already matches', () => {
    const first = createQuickVariable('serial', [])
    const second = createQuickVariable('serial', [first.name])
    const { document, objectId } = documentWith('text', `{${second.name}}`, [first, second])
    const next = applyDataSource(document, objectId, { source: 'counter' })
    expect(expressionOf(next)).toBe(`{${second.name}}`)
    expect(next.template.variables).toHaveLength(2)
  })

  it('prefers a generically bound variable for the variable source', () => {
    const serial = createQuickVariable('serial', [])
    const today = createQuickVariable('today', [serial.name])
    const { document, objectId } = documentWith('text', '{serial}', [serial, today])
    const next = applyDataSource(document, objectId, { source: 'variable' })
    expect(expressionOf(next)).toBe(`{${today.name}}`)
    expect(next.template.variables).toHaveLength(2)
  })

  it('creates a valid prompt variable when none exists', () => {
    const { document, objectId } = documentWith('text', 'Operator')
    const next = applyDataSource(document, objectId, { source: 'prompt' })
    const created = next.template.variables[0]
    expect(created).toMatchObject({ kind: 'prompt', label: 'Operator', required: true })
    expect(expressionOf(next)).toBe(`{${created?.name}}`)
    // Nothing has been answered yet, so the preview is empty rather than raw.
    expect(dataSourcePreview(expressionOf(next), next.template.variables)).toBe('')
  })

  it('never answers the variable source with a counter, prompt or field', () => {
    const serial = createQuickVariable('serial', [])
    const { document, objectId } = documentWith('barcode', '1234567890', [serial])
    expect(applyDataSource(document, objectId, { source: 'variable' })).toBe(document)
  })

  it('leaves a custom expression alone until a source is chosen', () => {
    const serial = createQuickVariable('serial', [])
    const { document, objectId } = documentWith('text', 'SN-{serial}/{missing}', [serial])
    expect(classifyDataSource(expressionOf(document), document.template.variables)).toMatchObject({
      state: 'custom'
    })
    const next = applyDataSource(document, objectId, { source: 'counter' })
    expect(expressionOf(next)).toBe('{serial}')
  })

  it('binds the named variable when one is chosen', () => {
    const serial = createQuickVariable('serial', [])
    const operator = createQuickVariable('operator', [])
    const { document, objectId } = documentWith('text', '{serial}', [serial, operator])
    const next = applyDataSource(document, objectId, {
      source: 'variable',
      variableName: 'operator'
    })
    expect(expressionOf(next)).toBe('{operator}')
  })

  it('unbinds to the resolved value when the source becomes fixed', () => {
    const serial = createQuickVariable('serial', [])
    const { document, objectId } = documentWith('barcode', '{serial}', [serial])
    const next = applyDataSource(document, objectId, { source: 'fixed' })
    expect(expressionOf(next)).toBe('0001')
    expect(next.template.variables).toHaveLength(1)
  })

  it('leaves locked objects and objects without an expression alone', () => {
    const { document, objectId } = documentWith('barcode', '1234567890')
    document.template.design.objects[0]!.locked = true
    expect(applyDataSource(document, objectId, { source: 'counter' })).toBe(document)
    expect(applyDataSource(document, 'missing-id', { source: 'counter' })).toBe(document)
  })

  it('does nothing when the generic variable source has nothing to bind', () => {
    const { document, objectId } = documentWith('text', 'Plain text')
    expect(applyDataSource(document, objectId, { source: 'variable' })).toBe(document)
  })
})

describe('data source preview', () => {
  it('resolves the expression through the sample variable values', () => {
    const serial = createQuickVariable('serial', [])
    const column = createQuickVariable('excel', [], 'Column')
    if (column.kind === 'field') column.sampleValue = 'A-17'
    expect(dataSourcePreview('{serial}', [serial])).toBe('0001')
    expect(dataSourcePreview('{Column}', [column])).toBe('A-17')
    expect(dataSourcePreview('SN-{serial}', [serial])).toBe('SN-0001')
    expect(dataSourcePreview('{missing}', [])).toBe('{missing}')
  })
})
