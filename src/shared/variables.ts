/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type {
  CounterVariable,
  LabelDocument,
  LabelObject,
  LabelVariable,
  PromptVariable
} from './template/types'

export interface EvaluationContext {
  prompts?: Record<string, string>
  counters?: Record<string, number>
  fields?: Record<string, string>
  now?: Date
  sample?: boolean
}

export interface EvaluationResult {
  values: Record<string, string>
  errors: string[]
}

const token = /\{([A-Za-z_][A-Za-z0-9_-]*)\}/g

export function validatePrompt(variable: PromptVariable, value: string): string | null {
  if (variable.required && value.length === 0) return `${variable.label} is required.`
  if (value.length > variable.maxLength)
    return `${variable.label} must be ${variable.maxLength} characters or fewer.`
  if (variable.options.length && !variable.options.includes(value))
    return `${variable.label} must be one of the listed values.`
  if (variable.pattern) {
    try {
      if (!new RegExp(variable.pattern).test(value))
        return `${variable.label} does not match the required format.`
    } catch {
      return `${variable.label} has an invalid validation pattern.`
    }
  }
  return null
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function offsetDate(
  source: Date,
  offsets: { days?: number; months?: number; years?: number }
): Date {
  const result = new Date(source)
  const day = result.getDate()
  result.setDate(1)
  result.setFullYear(result.getFullYear() + (offsets.years ?? 0))
  result.setMonth(result.getMonth() + (offsets.months ?? 0))
  result.setDate(Math.min(day, daysInMonth(result.getFullYear(), result.getMonth())))
  result.setDate(result.getDate() + (offsets.days ?? 0))
  return result
}

export function formatDate(source: Date, pattern: string): string {
  const parts: Record<string, string> = {
    yyyy: String(source.getFullYear()).padStart(4, '0'),
    MM: String(source.getMonth() + 1).padStart(2, '0'),
    dd: String(source.getDate()).padStart(2, '0'),
    HH: String(source.getHours()).padStart(2, '0'),
    mm: String(source.getMinutes()).padStart(2, '0'),
    ss: String(source.getSeconds()).padStart(2, '0')
  }
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, (part) => parts[part]!)
}

function encodePositive(value: number, alphabet: string): string {
  if (value === 0) return alphabet[0]!
  let remaining = Math.abs(Math.trunc(value))
  let output = ''
  while (remaining > 0) {
    output = alphabet[remaining % alphabet.length]! + output
    remaining = Math.floor(remaining / alphabet.length)
  }
  return value < 0 ? `-${output}` : output
}

export function formatCounter(variable: CounterVariable, value: number): string {
  const alphabet =
    variable.format === 'hex'
      ? '0123456789ABCDEF'
      : variable.format === 'alphanumeric'
        ? '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        : variable.format === 'custom'
          ? variable.alphabet
          : '0123456789'
  if (new Set(alphabet).size < 2) throw new Error(`${variable.name} needs at least two symbols.`)
  const encoded = encodePositive(value, alphabet)
  const negative = encoded.startsWith('-')
  const body = (negative ? encoded.slice(1) : encoded).padStart(variable.padding, variable.padChar)
  return `${variable.prefix}${negative ? '-' : ''}${body}${variable.suffix}`
}

export function counterValue(variable: CounterVariable, index: number, first?: number): number {
  const raw = (first ?? variable.start) + variable.step * index
  if (raw >= variable.min && raw <= variable.max) return raw
  if (variable.overflow === 'stop') throw new Error(`${variable.name} reached its limit.`)
  const span = variable.max - variable.min + 1
  return variable.min + ((((raw - variable.min) % span) + span) % span)
}

export function evaluateVariables(
  variables: readonly LabelVariable[],
  context: EvaluationContext = {}
): EvaluationResult {
  const values: Record<string, string> = {}
  const errors: string[] = []
  const now = context.now ?? new Date()
  for (const variable of variables) {
    try {
      switch (variable.kind) {
        case 'fixed':
          values[variable.name] = variable.value
          break
        case 'prompt': {
          const value = context.prompts?.[variable.name] ?? variable.defaultValue
          const error = validatePrompt(variable, value)
          if (error) errors.push(error)
          values[variable.name] = value
          break
        }
        case 'counter':
          values[variable.name] = formatCounter(
            variable,
            context.counters?.[variable.name] ?? variable.start
          )
          break
        case 'datetime':
          values[variable.name] = formatDate(
            offsetDate(now, {
              days: variable.offsetDays,
              months: variable.offsetMonths,
              years: variable.offsetYears
            }),
            variable.format
          )
          break
        case 'formula':
          values[variable.name] = evaluateTemplate(variable.expression, values).value
          break
        case 'field':
          values[variable.name] =
            context.fields?.[variable.column] ?? (context.sample ? variable.sampleValue : '')
          break
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { values, errors }
}

export function evaluateTemplate(
  expression: string,
  values: Readonly<Record<string, string>>
): { value: string; errors: string[] } {
  const errors: string[] = []
  const value = expression.replace(token, (placeholder, name: string) => {
    if (!(name in values)) {
      errors.push(`Unknown variable ${placeholder}.`)
      return placeholder
    }
    return values[name]!
  })
  return { value, errors }
}

export function templateVariableNames(expression: string): string[] {
  return [...expression.matchAll(token)].map((match) => match[1]!)
}

export interface TemplateSegment {
  /** The text exactly as the expression carries it, braces included. */
  text: string
  /** The variable name for a `{name}` token, or null for literal text. */
  variable: string | null
}

/**
 * Splits an expression into its literal runs and `{name}` tokens, in order, so
 * a surface can tint each variable without re-deriving where it starts. The
 * segment texts always concatenate back to the expression unchanged.
 */
export function templateSegments(expression: string): TemplateSegment[] {
  const segments: TemplateSegment[] = []
  let offset = 0
  for (const match of expression.matchAll(token)) {
    const index = match.index!
    if (index > offset) segments.push({ text: expression.slice(offset, index), variable: null })
    segments.push({ text: match[0], variable: match[1]! })
    offset = index + match[0].length
  }
  if (offset < expression.length) segments.push({ text: expression.slice(offset), variable: null })
  return segments
}

export interface VariableUsage {
  used: string[]
  unused: string[]
  undefined: string[]
}

export function analyzeVariableUsage(document: LabelDocument): VariableUsage {
  const variables = new Map(
    document.template.variables.map((variable) => [variable.name, variable])
  )
  const used = new Set<string>()
  const missing = new Set<string>()
  const visit = (name: string): void => {
    const variable = variables.get(name)
    if (!variable) {
      missing.add(name)
      return
    }
    if (used.has(name)) return
    used.add(name)
    if (variable.kind === 'formula') templateVariableNames(variable.expression).forEach(visit)
  }
  for (const object of document.template.design.objects) {
    if (object.kind === 'text') templateVariableNames(object.text).forEach(visit)
    if (object.kind === 'barcode' || object.kind === 'qrcode')
      templateVariableNames(object.data).forEach(visit)
  }
  for (const variable of document.template.variables)
    if (variable.kind === 'formula')
      for (const name of templateVariableNames(variable.expression))
        if (!variables.has(name)) missing.add(name)
  return {
    used: [...used],
    unused: [...variables.keys()].filter((name) => !used.has(name)),
    undefined: [...missing]
  }
}

export function evaluatedDocument(
  document: LabelDocument,
  context: EvaluationContext = {}
): { document: LabelDocument; errors: string[] } {
  const evaluated = evaluateVariables(document.template.variables, context)
  const errors = [...evaluated.errors]
  const objects = document.template.design.objects.map((object): LabelObject => {
    if (object.kind !== 'text' && object.kind !== 'barcode' && object.kind !== 'qrcode')
      return object
    const source = object.kind === 'text' ? object.text : object.data
    const result = evaluateTemplate(source, evaluated.values)
    errors.push(...result.errors.map((error) => `${object.name}: ${error}`))
    return object.kind === 'text'
      ? { ...object, text: result.value }
      : { ...object, data: result.value }
  })
  return {
    document: {
      ...document,
      template: {
        ...document.template,
        variables: [],
        dataSources: [],
        design: { ...document.template.design, objects }
      }
    },
    errors
  }
}

export function counterResetKey(reset: CounterVariable['reset'], date: Date): string {
  if (reset === 'never') return 'never'
  const year = date.getFullYear()
  if (reset === 'yearly') return String(year)
  const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`
  return reset === 'monthly' ? month : `${month}-${String(date.getDate()).padStart(2, '0')}`
}
