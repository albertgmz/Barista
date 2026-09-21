/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import bwipjs from 'bwip-js/browser'
import type { LabelObject } from '../template/types'
import { symbologyDescriptor } from '../template/symbologies'

const NAMED_COLORS: Record<string, string> = { black: '#000000', white: '#ffffff' }

/** bwip-js only accepts six-digit hex, while the document schema also allows names. */
function encoderColor(color: string): string | undefined {
  const value = NAMED_COLORS[color] ?? color
  return /^#?[0-9a-fA-F]{6}$/.test(value) ? value : undefined
}

export function barcodeSvg(o: Extract<LabelObject, { kind: 'barcode' | 'qrcode' }>): string {
  const color = encoderColor(o.color)
  const descriptor = o.kind === 'barcode' ? symbologyDescriptor(o.symbology) : undefined
  const checkDigit = o.kind === 'barcode' && o.addCheckDigit && !!descriptor?.optionalCheckDigit
  const options =
    o.kind === 'barcode'
      ? {
          bcid: descriptor?.bcid ?? o.symbology,
          text: o.data,
          scale: 1,
          height: o.barHeightMm,
          includetext: o.showHumanReadable,
          textsize: o.humanReadableFontSizePt,
          paddingwidth: o.quietZoneMm / o.moduleWidthMm,
          includecheck: checkDigit,
          includecheckintext: checkDigit,
          ...(color ? { barcolor: color, textcolor: color } : {})
        }
      : {
          bcid: o.symbology ?? 'qrcode',
          text: o.data,
          scale: 1,
          eclevel: o.errorCorrection,
          padding: o.quietZoneModules * 2,
          ...(color ? { barcolor: color } : {})
        }
  return bwipjs.toSVG(options)
}

export function barcodeError(o: LabelObject): string | null {
  if (o.kind !== 'barcode' && o.kind !== 'qrcode') return null
  try {
    barcodeSvg(o)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
