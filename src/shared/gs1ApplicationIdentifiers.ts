/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Required subset of GS1 Application Identifiers.
 * Source: GS1 General Specifications, section 3.2, AI table:
 * https://ref.gs1.org/standards/genspecs/
 */
export interface Gs1AiDefinition {
  ai: string
  title: string
  minLength: number
  maxLength: number
  fixedLength: boolean
  characterSet: 'numeric' | 'alphanumeric'
  date?: boolean
  checkDigit?: 'gtin' | 'sscc' | 'gln'
}

export const GS1_APPLICATION_IDENTIFIERS: readonly Gs1AiDefinition[] = [
  {
    ai: '00',
    title: 'SSCC',
    minLength: 18,
    maxLength: 18,
    fixedLength: true,
    characterSet: 'numeric',
    checkDigit: 'sscc'
  },
  {
    ai: '01',
    title: 'GTIN',
    minLength: 14,
    maxLength: 14,
    fixedLength: true,
    characterSet: 'numeric',
    checkDigit: 'gtin'
  },
  {
    ai: '02',
    title: 'GTIN of contained trade items',
    minLength: 14,
    maxLength: 14,
    fixedLength: true,
    characterSet: 'numeric',
    checkDigit: 'gtin'
  },
  {
    ai: '10',
    title: 'Batch or lot number',
    minLength: 1,
    maxLength: 20,
    fixedLength: false,
    characterSet: 'alphanumeric'
  },
  {
    ai: '11',
    title: 'Production date',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric',
    date: true
  },
  {
    ai: '13',
    title: 'Packaging date',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric',
    date: true
  },
  {
    ai: '15',
    title: 'Best before date',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric',
    date: true
  },
  {
    ai: '17',
    title: 'Expiration date',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric',
    date: true
  },
  {
    ai: '21',
    title: 'Serial number',
    minLength: 1,
    maxLength: 20,
    fixedLength: false,
    characterSet: 'alphanumeric'
  },
  {
    ai: '240',
    title: 'Additional product identification',
    minLength: 1,
    maxLength: 30,
    fixedLength: false,
    characterSet: 'alphanumeric'
  },
  {
    ai: '241',
    title: 'Customer part number',
    minLength: 1,
    maxLength: 30,
    fixedLength: false,
    characterSet: 'alphanumeric'
  },
  {
    ai: '310x',
    title: 'Net weight, kilograms',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric'
  },
  {
    ai: '311x',
    title: 'Length, metres',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric'
  },
  {
    ai: '312x',
    title: 'Width, metres',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric'
  },
  {
    ai: '313x',
    title: 'Height, metres',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric'
  },
  {
    ai: '314x',
    title: 'Area, square metres',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric'
  },
  {
    ai: '315x',
    title: 'Net volume, litres',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric'
  },
  {
    ai: '316x',
    title: 'Net volume, cubic metres',
    minLength: 6,
    maxLength: 6,
    fixedLength: true,
    characterSet: 'numeric'
  },
  {
    ai: '37',
    title: 'Count of trade items',
    minLength: 1,
    maxLength: 8,
    fixedLength: false,
    characterSet: 'numeric'
  },
  {
    ai: '400',
    title: 'Customer purchase order number',
    minLength: 1,
    maxLength: 30,
    fixedLength: false,
    characterSet: 'alphanumeric'
  },
  {
    ai: '410',
    title: 'Ship to GLN',
    minLength: 13,
    maxLength: 13,
    fixedLength: true,
    characterSet: 'numeric',
    checkDigit: 'gln'
  },
  {
    ai: '411',
    title: 'Bill to GLN',
    minLength: 13,
    maxLength: 13,
    fixedLength: true,
    characterSet: 'numeric',
    checkDigit: 'gln'
  },
  {
    ai: '412',
    title: 'Purchased from GLN',
    minLength: 13,
    maxLength: 13,
    fixedLength: true,
    characterSet: 'numeric',
    checkDigit: 'gln'
  },
  {
    ai: '413',
    title: 'Ship for GLN',
    minLength: 13,
    maxLength: 13,
    fixedLength: true,
    characterSet: 'numeric',
    checkDigit: 'gln'
  },
  {
    ai: '414',
    title: 'Physical location GLN',
    minLength: 13,
    maxLength: 13,
    fixedLength: true,
    characterSet: 'numeric',
    checkDigit: 'gln'
  },
  {
    ai: '8004',
    title: 'Individual asset reference',
    minLength: 1,
    maxLength: 30,
    fixedLength: false,
    characterSet: 'alphanumeric'
  }
]

export function gs1AiDefinition(ai: string): Gs1AiDefinition | undefined {
  return GS1_APPLICATION_IDENTIFIERS.find((definition) =>
    definition.ai.endsWith('x')
      ? ai.length === definition.ai.length &&
        ai.startsWith(definition.ai.slice(0, -1)) &&
        /\d$/.test(ai)
      : definition.ai === ai
  )
}
