/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { FontEmbeddingPermission, FontFileMimeType, LabelDocument } from './template/types'

export type FontSource = 'embedded' | 'custom' | 'bundled'

export interface FontFaceInfo {
  id: string
  fileName: string
  mimeType: FontFileMimeType
  style: 'normal' | 'italic'
  weight: string
  byteLength: number
  embedding: FontEmbeddingPermission
  noSubsetting: boolean
  dataBase64: string
}

export interface FontFamilyInfo {
  id: string
  family: string
  aliases: string[]
  source: FontSource
  license: string
  licenseUrl?: string
  copyright: string
  faces: FontFaceInfo[]
}

export interface FontCatalog {
  families: FontFamilyInfo[]
}

export interface FontResolution {
  requestedFamily: string
  family: FontFamilyInfo
  substituted: boolean
}

const SOURCE_PRIORITY: Readonly<Record<FontSource, number>> = {
  embedded: 0,
  custom: 1,
  bundled: 2
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

export function resolveFontFamily(requestedFamily: string, catalog: FontCatalog): FontResolution {
  const requested = normalize(requestedFamily)
  const exact = catalog.families
    .filter(
      (family) =>
        normalize(family.family) === requested ||
        family.aliases.some((alias) => normalize(alias) === requested)
    )
    .sort((a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source])[0]
  if (exact) return { requestedFamily, family: exact, substituted: false }

  const fallback = catalog.families.find(
    (family) => family.source === 'bundled' && family.id === 'inter'
  )
  if (!fallback) throw new Error('The bundled Inter fallback font is unavailable.')
  return { requestedFamily, family: fallback, substituted: true }
}

export interface MissingFontWarning {
  requestedFamily: string
  substituteFamily: string
  objectIds: string[]
  objectNames: string[]
}

export function missingFontWarnings(
  document: LabelDocument,
  catalog: FontCatalog
): MissingFontWarning[] {
  const warnings = new Map<string, MissingFontWarning>()
  for (const object of document.template.design.objects) {
    if (object.kind !== 'text') continue
    const resolved = resolveFontFamily(object.fontFamily, catalog)
    if (!resolved.substituted) continue
    const key = normalize(object.fontFamily)
    const warning = warnings.get(key) ?? {
      requestedFamily: object.fontFamily,
      substituteFamily: resolved.family.family,
      objectIds: [],
      objectNames: []
    }
    warning.objectIds.push(object.id)
    warning.objectNames.push(object.name)
    warnings.set(key, warning)
  }
  return [...warnings.values()]
}
