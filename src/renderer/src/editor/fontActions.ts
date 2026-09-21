/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { FontFamilyInfo } from '@shared/fonts'
import type { FontReference } from '@shared/template/types'
import { useDocumentStore } from '../store/documentStore'

export function applyFontFamily(font: FontFamilyInfo, objectIds: string[]): string | null {
  const face = font.faces[0]
  if (!face) return `The font “${font.family}” has no usable font file.`

  let reference: FontReference
  let dataBase64: string | undefined
  if (font.source === 'bundled') {
    reference = {
      id: font.id,
      family: font.family,
      license: font.license,
      copyright: font.copyright,
      style: face.style,
      weight: face.weight,
      noSubsetting: face.noSubsetting,
      source: 'bundled',
      bundleId: font.id
    }
  } else if (
    font.source === 'embedded' ||
    face.embedding === 'installable' ||
    face.embedding === 'editable'
  ) {
    reference = {
      id: font.id,
      family: font.family,
      license: font.license,
      copyright: font.copyright,
      style: face.style,
      weight: face.weight,
      noSubsetting: face.noSubsetting,
      source: 'embedded',
      fileName: face.fileName,
      mimeType: face.mimeType,
      byteLength: face.byteLength,
      embedding: face.embedding === 'editable' ? 'editable' : 'installable'
    }
    dataBase64 = face.dataBase64
  } else {
    reference = {
      id: font.id,
      family: font.family,
      license: font.license,
      copyright: font.copyright,
      style: face.style,
      weight: face.weight,
      noSubsetting: face.noSubsetting,
      source: 'external',
      fileName: face.fileName,
      mimeType: face.mimeType,
      embedding: face.embedding
    }
  }

  useDocumentStore.getState().change((document) => ({
    ...document,
    template: {
      ...document.template,
      fonts: [...document.template.fonts.filter((item) => item.id !== reference.id), reference],
      design: {
        ...document.template.design,
        objects: document.template.design.objects.map((object) =>
          object.kind === 'text' && objectIds.includes(object.id)
            ? { ...object, fontFamily: font.family }
            : object
        )
      }
    },
    fontData: dataBase64
      ? { ...document.fontData, [reference.id]: dataBase64 }
      : Object.fromEntries(Object.entries(document.fontData).filter(([id]) => id !== reference.id))
  }))

  return reference.source === 'external'
    ? `“${font.family}” does not permit embedding. This label stores only a reference, so the font must be imported on every computer that opens it.`
    : null
}
