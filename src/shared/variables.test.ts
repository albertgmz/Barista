/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import type { CounterVariable, PromptVariable } from './template/types'
import {
  analyzeVariableUsage,
  counterResetKey,
  counterValue,
  evaluatedDocument,
  evaluateTemplate,
  evaluateVariables,
  formatCounter,
  offsetDate,
  templateSegments,
  validatePrompt
} from './variables'
import { createDocument, createObject } from './template/document'

const counter = (patch: Partial<CounterVariable> = {}): CounterVariable => ({
  id: 'serial',
  name: 'serial',
  kind: 'counter',
  start: 1,
  step: 1,
  padding: 4,
  padChar: '0',
  prefix: '',
  suffix: '',
  scope: 'template',
  sharedName: '',
  format: 'numeric',
  alphabet: 'ABC',
  min: 0,
  max: 9999,
  overflow: 'stop',
  reset: 'never',
  failure: 'void',
  ...patch
})

describe('variable evaluation', () => {
  it('substitutes fixed, prompted, counter and date values', () => {
    const result = evaluateVariables(
      [
        { id: '1', name: 'equipment', kind: 'fixed', value: 'D530' },
        {
          id: '2',
          name: 'tech',
          kind: 'prompt',
          label: 'Technician',
          defaultValue: '',
          required: true,
          maxLength: 20,
          options: ['JACOB'],
          pattern: ''
        },
        counter(),
        {
          id: '4',
          name: 'due',
          kind: 'datetime',
          format: 'yyyy-MM-dd',
          offsetDays: 30,
          offsetMonths: 0,
          offsetYears: 0
        }
      ],
      { prompts: { tech: 'JACOB' }, counters: { serial: 42 }, now: new Date(2024, 0, 2) }
    )
    expect(result.errors).toEqual([])
    expect(evaluateTemplate('{equipment}-{serial}-{tech}-{due}', result.values).value).toBe(
      'D530-0042-JACOB-2024-02-01'
    )
  })

  it.each([
    ['numeric', '', 31, '0031'],
    ['hex', '', 31, '001F'],
    ['alphanumeric', '', 36, '0010'],
    ['custom', 'ABC', 5, '00BC']
  ] as const)('formats %s counters', (format, alphabet, value, expected) => {
    expect(formatCounter(counter({ format, alphabet }), value)).toBe(expected)
  })

  it('supports decrement, wrap and stop', () => {
    expect(counterValue(counter({ start: 1, step: -1, min: 0, max: 2, overflow: 'wrap' }), 2)).toBe(
      2
    )
    expect(() => counterValue(counter({ start: 1, max: 1 }), 1)).toThrow('limit')
  })

  it('clamps calendar offsets at month end and leap years', () => {
    expect(
      offsetDate(new Date(2024, 0, 31), { months: 1 })
        .toISOString()
        .slice(0, 10)
    ).toBe('2024-02-29')
    expect(
      offsetDate(new Date(2024, 1, 29), { years: 1 })
        .toISOString()
        .slice(0, 10)
    ).toBe('2025-02-28')
  })

  it('validates prompt requirements, choices, length and regex', () => {
    const prompt: PromptVariable = {
      id: 'p',
      name: 'p',
      kind: 'prompt',
      label: 'Equipment',
      defaultValue: '',
      required: true,
      maxLength: 4,
      options: [],
      pattern: '^[A-Z]+$'
    }
    expect(validatePrompt(prompt, '')).toContain('required')
    expect(validatePrompt(prompt, 'ABCDE')).toContain('characters')
    expect(validatePrompt(prompt, '12')).toContain('format')
    expect(validatePrompt(prompt, 'AB')).toBeNull()
  })

  it('creates reset period keys at date boundaries', () => {
    const date = new Date(2024, 1, 29)
    expect(counterResetKey('daily', date)).toBe('2024-02-29')
    expect(counterResetKey('monthly', date)).toBe('2024-02')
    expect(counterResetKey('yearly', date)).toBe('2024')
    expect(counterResetKey('never', date)).toBe('never')
  })

  it('evaluates spreadsheet fields from records and sample values', () => {
    const variable = {
      id: 'asset-field',
      name: 'asset',
      kind: 'field' as const,
      column: 'Asset Number',
      sampleValue: 'EQ-100'
    }
    expect(
      evaluateVariables([variable], { fields: { 'Asset Number': 'EQ-432' } }).values.asset
    ).toBe('EQ-432')
    expect(evaluateVariables([variable], { sample: true }).values.asset).toBe('EQ-100')
  })

  it('reports transitive, unused and undefined variable references', () => {
    const document = createDocument()
    document.template.variables = [
      { id: 'first', name: 'first', kind: 'fixed', value: 'A' },
      { id: 'full', name: 'full', kind: 'formula', expression: '{first}-{missing}' },
      { id: 'unused', name: 'unused', kind: 'fixed', value: 'B' }
    ]
    const text = createObject('text', 0, 0)
    if (text.kind !== 'text') throw new Error('Expected text object')
    text.text = '{full}'
    document.template.design.objects.push(text)
    expect(analyzeVariableUsage(document)).toEqual({
      used: ['full', 'first'],
      unused: ['unused'],
      undefined: ['missing']
    })
  })

  it('removes data bindings from an evaluated render document', () => {
    const document = createDocument()
    document.template.variables = [
      { id: 'field', name: 'asset', kind: 'field', column: 'Asset', sampleValue: 'EQ-1' }
    ]
    document.template.dataSources = [
      {
        id: 'source',
        name: 'Equipment',
        path: 'equipment.xlsx',
        selection: { kind: 'sheet', name: 'Equipment' },
        headerRow: 1,
        keyColumn: 'Asset',
        filter: null,
        mappings: [{ column: 'Asset', variable: 'asset' }],
        writeStatusColumn: false
      }
    ]
    const result = evaluatedDocument(document, { fields: { Asset: 'EQ-9' } }).document
    expect(result.template.variables).toEqual([])
    expect(result.template.dataSources).toEqual([])
  })
})

describe('template segments', () => {
  it('splits literal text and tokens in order, keeping the braces', () => {
    expect(templateSegments('Testing101 {date_today}')).toEqual([
      { text: 'Testing101 ', variable: null },
      { text: '{date_today}', variable: 'date_today' }
    ])
  })

  it('keeps adjacent tokens apart and reports a leading token', () => {
    expect(templateSegments('{a}{b} end')).toEqual([
      { text: '{a}', variable: 'a' },
      { text: '{b}', variable: 'b' },
      { text: ' end', variable: null }
    ])
  })

  it('returns one literal segment for text without variables, and none for empty text', () => {
    expect(templateSegments('Lot 42')).toEqual([{ text: 'Lot 42', variable: null }])
    expect(templateSegments('')).toEqual([])
  })

  it('leaves text that is not a variable token literal', () => {
    expect(templateSegments('{1bad} { spaced } {')).toEqual([
      { text: '{1bad} { spaced } {', variable: null }
    ])
  })

  it('rejoins to the original expression', () => {
    for (const expression of ['', '{a}', 'a{b}c', '{a}{b}', '}{', 'no variables here'])
      expect(
        templateSegments(expression)
          .map((segment) => segment.text)
          .join('')
      ).toBe(expression)
  })
})
