/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { newId } from '@shared/template/document'
import type {
  LabelDocument,
  LabelObject,
  LabelVariable,
  VariableKind
} from '@shared/template/types'

export function uniqueVariableName(preferred: string, existing: Iterable<string>): string {
  const names = new Set(existing)
  const normalized = preferred
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^[^A-Za-z_]+/, '')
    .replace(/^$/, 'variable')
  if (!names.has(normalized)) return normalized
  let index = 2
  while (names.has(`${normalized}${index}`)) index += 1
  return `${normalized}${index}`
}

export function createVariable(
  kind: VariableKind,
  existing: Iterable<string>,
  preferred = 'variable'
): LabelVariable {
  const base = { id: newId(), name: uniqueVariableName(preferred, existing) }
  switch (kind) {
    case 'fixed':
      return { ...base, kind, value: '' }
    case 'prompt':
      return {
        ...base,
        kind,
        label: 'Enter value',
        defaultValue: '',
        required: false,
        maxLength: 100,
        options: [],
        pattern: ''
      }
    case 'counter':
      return {
        ...base,
        kind,
        start: 1,
        step: 1,
        padding: 4,
        padChar: '0',
        prefix: '',
        suffix: '',
        scope: 'template',
        sharedName: '',
        format: 'numeric',
        alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        min: 0,
        max: 999999999,
        overflow: 'stop',
        reset: 'never',
        failure: 'void'
      }
    case 'datetime':
      return {
        ...base,
        kind,
        format: 'yyyy-MM-dd',
        offsetDays: 0,
        offsetMonths: 0,
        offsetYears: 0
      }
    case 'formula':
      return { ...base, kind, expression: '' }
    case 'field':
      return { ...base, kind, column: 'Column', sampleValue: '' }
  }
}

export type QuickVariablePreset = 'today' | 'future-date' | 'serial' | 'operator' | 'excel'

export function createQuickVariable(
  preset: QuickVariablePreset,
  existing: Iterable<string>,
  option?: string | number
): LabelVariable {
  if (preset === 'today') return createVariable('datetime', existing, 'today')
  if (preset === 'future-date') {
    const variable = createVariable('datetime', existing, 'expiry')
    if (variable.kind === 'datetime') variable.offsetDays = Number(option ?? 30)
    return variable
  }
  if (preset === 'serial') return createVariable('counter', existing, 'serial')
  if (preset === 'operator') {
    const variable = createVariable('prompt', existing, 'operator')
    if (variable.kind === 'prompt') {
      variable.label = 'Operator'
      variable.required = true
    }
    return variable
  }
  const column = String(option ?? 'Column').trim() || 'Column'
  const variable = createVariable('field', existing, column)
  if (variable.kind === 'field') variable.column = column
  return variable
}

/** The data expression an object carries, or `null` where it has none. */
export function objectExpression(object: LabelObject): string | null {
  if (object.kind === 'text') return object.text
  if (object.kind === 'barcode' || object.kind === 'qrcode') return object.data
  return null
}

export function setObjectExpression(object: LabelObject, expression: string): LabelObject {
  if (object.kind === 'text') return { ...object, text: expression }
  if (object.kind === 'barcode' || object.kind === 'qrcode') return { ...object, data: expression }
  return object
}

/**
 * `append` is the additive gesture behind Bind to variable… and the canvas
 * drop; `replace` is the single-source binding the Data Source section sets.
 */
export function bindVariable(
  object: LabelObject,
  name: string,
  mode: 'append' | 'replace' = 'append'
): LabelObject {
  const expression = objectExpression(object)
  if (expression === null) return object
  const placeholder = `{${name}}`
  return setObjectExpression(
    object,
    mode === 'replace' ? placeholder : `${expression}${placeholder}`
  )
}

export function makeVariableFromSelection(
  document: LabelDocument,
  objectId: string,
  start: number,
  end: number,
  name: string
): LabelDocument {
  const object = document.template.design.objects.find((candidate) => candidate.id === objectId)
  if (
    !object ||
    object.kind !== 'text' ||
    object.locked ||
    start < 0 ||
    end <= start ||
    end > object.text.length
  )
    return document
  const selected = object.text.slice(start, end)
  const variable: LabelVariable = {
    id: newId(),
    name: uniqueVariableName(
      name,
      document.template.variables.map((item) => item.name)
    ),
    kind: 'fixed',
    value: selected
  }
  return {
    ...document,
    template: {
      ...document.template,
      variables: [...document.template.variables, variable],
      design: {
        ...document.template.design,
        objects: document.template.design.objects.map((candidate) =>
          candidate.id === object.id
            ? {
                ...object,
                text: `${object.text.slice(0, start)}{${variable.name}}${object.text.slice(end)}`
              }
            : candidate
        )
      }
    }
  }
}
