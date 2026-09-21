/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * The single source of truth for the linear symbologies the barcode object
 * supports: the persisted schema value, the bwip-js encoder that renders it,
 * and the data rule an operator has to satisfy. The helpers below turn an
 * encoder failure into language an operator can act on.
 */

export interface BarcodeSymbologyDescriptor {
  /** Value persisted in `.bar` files. Never change these strings. */
  value: string
  /** bwip-js encoder name, which is not always the persisted value. */
  bcid: string
  /** Name shown in the interface. */
  label: string
  /** Data rule as a predicate, completing "<label> data …". */
  rule: string
  /** Data that satisfies the rule. */
  example: string
  /**
   * Whether the symbology takes an optional check digit. The fixed-length
   * retail symbologies calculate their own, and asking bwip-js for a second
   * one either does nothing or, for ITF-14, encodes digits the human-readable
   * text does not show.
   */
  optionalCheckDigit: boolean
}

export const BARCODE_SYMBOLOGIES = [
  {
    value: 'code128',
    bcid: 'code128',
    label: 'Code 128',
    rule: 'accepts any ASCII text',
    example: 'CODE128',
    optionalCheckDigit: false
  },
  {
    value: 'code39',
    bcid: 'code39',
    label: 'Code 39',
    rule: 'must use only A–Z, 0–9, space and - . $ / + %',
    example: 'CODE39',
    optionalCheckDigit: true
  },
  {
    value: 'code93',
    bcid: 'code93',
    label: 'Code 93',
    rule: 'must use only A–Z, 0–9, space and - . $ / + %',
    example: 'CODE93',
    optionalCheckDigit: true
  },
  {
    value: 'codabar',
    bcid: 'rationalizedCodabar',
    label: 'Codabar',
    rule: 'must be digits framed by an uppercase start and stop letter from A to D',
    example: 'A123456A',
    optionalCheckDigit: true
  },
  {
    value: 'ean13',
    bcid: 'ean13',
    label: 'EAN-13',
    rule: 'must be 12 digits, or 13 with a valid check digit',
    example: '012345678912',
    optionalCheckDigit: false
  },
  {
    value: 'ean8',
    bcid: 'ean8',
    label: 'EAN-8',
    rule: 'must be 7 digits, or 8 with a valid check digit',
    example: '0123456',
    optionalCheckDigit: false
  },
  {
    value: 'upca',
    bcid: 'upca',
    label: 'UPC-A',
    rule: 'must be 11 digits, or 12 with a valid check digit',
    example: '01234567891',
    optionalCheckDigit: false
  },
  {
    value: 'upce',
    bcid: 'upce',
    label: 'UPC-E',
    rule: 'must be 7 digits, or 8 with a valid check digit',
    example: '0123456',
    optionalCheckDigit: false
  },
  {
    value: 'itf14',
    bcid: 'itf14',
    label: 'ITF-14',
    rule: 'must be 13 digits, or 14 with a valid check digit',
    example: '0123456789012',
    optionalCheckDigit: false
  },
  {
    value: 'interleaved2of5',
    bcid: 'interleaved2of5',
    label: 'Interleaved 2 of 5',
    rule: 'must be digits; an odd count gains a leading zero',
    example: '0123456789',
    optionalCheckDigit: true
  },
  {
    value: 'gs1-128',
    bcid: 'gs1-128',
    label: 'GS1-128',
    rule: 'must be element strings starting with an application identifier in parentheses',
    example: '(01)09501101530003',
    optionalCheckDigit: false
  }
] as const satisfies readonly BarcodeSymbologyDescriptor[]

/** 1D symbologies supported by the barcode object. */
export type BarcodeSymbology = (typeof BARCODE_SYMBOLOGIES)[number]['value']

/** The persisted values, in dropdown order, as a non-empty tuple for `z.enum`. */
export const BARCODE_SYMBOLOGY_VALUES = BARCODE_SYMBOLOGIES.map(
  (descriptor) => descriptor.value
) as [BarcodeSymbology, ...BarcodeSymbology[]]

export function symbologyDescriptor(symbology: string): BarcodeSymbologyDescriptor | undefined {
  return BARCODE_SYMBOLOGIES.find((descriptor) => descriptor.value === symbology)
}

/** One sentence explaining the data a symbology accepts, or null when unknown. */
export function symbologyDataRule(symbology: string): string | null {
  const descriptor = symbologyDescriptor(symbology)
  return descriptor
    ? `${descriptor.label} data ${descriptor.rule}, for example ${descriptor.example}`
    : null
}

/** Whether the symbology carries GS1 element strings, including the matrix carriers. */
export function isGs1Symbology(symbology: string | undefined): boolean {
  return symbology === 'gs1-128' || symbology === 'gs1datamatrix' || symbology === 'gs1qrcode'
}

/** Drops the `bwipp.<name>#<line>:` prefix the encoder puts in front of its messages. */
export function encoderMessage(message: string): string {
  return message.replace(/^(bwipp\.\w+(#\d+)?|bwip-js):\s*/, '')
}
