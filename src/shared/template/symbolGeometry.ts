/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { LabelObject } from './types'
/** Keep physical module controls consistent with the object's mm geometry. */
export function reconcileSymbol(object: LabelObject, previous?: LabelObject): LabelObject {
  if (object.kind !== 'barcode' && object.kind !== 'qrcode') return object
  if (object.kind === 'barcode') {
    const old = previous?.kind === 'barcode' ? previous : undefined
    if (!old) return object
    const modules = Math.max(1, (old.widthMm - 2 * old.quietZoneMm) / old.moduleWidthMm)
    if (
      object.moduleWidthMm !== old.moduleWidthMm ||
      object.data !== old.data ||
      object.symbology !== old.symbology ||
      object.quietZoneMm !== old.quietZoneMm
    )
      return { ...object, widthMm: modules * object.moduleWidthMm + 2 * object.quietZoneMm }
    if (object.widthMm !== old.widthMm)
      return {
        ...object,
        moduleWidthMm: Math.max(0.01, (object.widthMm - 2 * object.quietZoneMm) / modules)
      }
    return object.barHeightMm !== old.barHeightMm
      ? { ...object, heightMm: object.heightMm + (object.barHeightMm - old.barHeightMm) }
      : object
  }
  const old = previous?.kind === 'qrcode' ? previous : undefined
  if (!old) return object
  const modules = Math.max(1, old.widthMm / old.moduleSizeMm)
  if (
    object.moduleSizeMm !== old.moduleSizeMm ||
    object.data !== old.data ||
    object.symbology !== old.symbology ||
    object.errorCorrection !== old.errorCorrection
  )
    return {
      ...object,
      widthMm: modules * object.moduleSizeMm,
      heightMm: modules * object.moduleSizeMm
    }
  return object.widthMm !== old.widthMm
    ? { ...object, moduleSizeMm: object.widthMm / modules }
    : object
}
