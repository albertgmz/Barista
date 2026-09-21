/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { gs1AiDefinition } from './gs1ApplicationIdentifiers'

export const GS1_GROUP_SEPARATOR = '\u001d'

export interface Gs1Element {
  ai: string
  value: string
}

export interface Gs1BuildResult {
  elements: Gs1Element[]
  humanReadable: string
  /** Scanner payload after the symbology's initial FNC1. */
  encoded: string
  /** AI notation consumed by bwip-js's dedicated GS1 encoders. */
  bwipText: string
}

export function gs1CheckDigit(body: string): string {
  if (!/^\d+$/.test(body)) throw new Error('GS1 check digits require numeric data.')
  const sum = [...body]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0)
  return String((10 - (sum % 10)) % 10)
}

function validGs1Date(value: string): boolean {
  if (!/^\d{6}$/.test(value)) return false
  const year = 2000 + Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  if (month < 1 || month > 12) return false
  if (day === 0) return true
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function normalizeGs1Value(ai: string, input: string): string {
  const definition = gs1AiDefinition(ai)
  if (!definition) throw new Error(`Unknown GS1 Application Identifier ${ai}.`)
  let value = input
  if (definition.checkDigit && value.length === definition.minLength - 1)
    value += gs1CheckDigit(value)
  if (value.length < definition.minLength || value.length > definition.maxLength)
    throw new Error(
      `AI ${ai} requires ${definition.fixedLength ? definition.minLength : `${definition.minLength}–${definition.maxLength}`} characters.`
    )
  if (definition.characterSet === 'numeric' && !/^\d+$/.test(value))
    throw new Error(`AI ${ai} accepts digits only.`)
  if (definition.characterSet === 'alphanumeric' && !/^[\x20-\x27\x2a-\x5d\x5f-\x7e]+$/.test(value))
    throw new Error(`AI ${ai} contains an unsupported character.`)
  if (definition.date && !validGs1Date(value))
    throw new Error(`AI ${ai} is not a valid YYMMDD date.`)
  if (definition.checkDigit) {
    const expected = gs1CheckDigit(value.slice(0, -1))
    if (value.at(-1) !== expected) throw new Error(`AI ${ai} has an invalid GS1 check digit.`)
  }
  return value
}

export function buildGs1(elements: readonly Gs1Element[]): Gs1BuildResult {
  if (!elements.length) throw new Error('Add at least one GS1 Application Identifier.')
  const normalized = elements.map((element) => ({
    ai: element.ai.trim(),
    value: normalizeGs1Value(element.ai.trim(), element.value)
  }))
  const humanReadable = normalized.map((element) => `(${element.ai})${element.value}`).join('')
  const encoded = normalized
    .map((element, index) => {
      const definition = gs1AiDefinition(element.ai)!
      const separator =
        !definition.fixedLength && index < normalized.length - 1 ? GS1_GROUP_SEPARATOR : ''
      return `${element.ai}${element.value}${separator}`
    })
    .join('')
  return { elements: normalized, humanReadable, encoded, bwipText: humanReadable }
}

export function gs1Template(elements: readonly Gs1Element[]): string {
  if (!elements.length) throw new Error('Add at least one GS1 Application Identifier.')
  for (const element of elements)
    if (!gs1AiDefinition(element.ai.trim()))
      throw new Error(`Unknown GS1 Application Identifier ${element.ai}.`)
  return elements.map((element) => `(${element.ai.trim()})${element.value}`).join('')
}
