/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { createDocument, createObject } from './template/document'
import type { FontCatalog, FontFamilyInfo } from './fonts'
import { missingFontWarnings, resolveFontFamily } from './fonts'

const family = (id: string, source: FontFamilyInfo['source']): FontFamilyInfo => ({
  id,
  family: 'Shared Family',
  aliases: [],
  source,
  license: 'Test license',
  copyright: 'Test copyright',
  faces: []
})

describe('font resolution', () => {
  it('prefers embedded, then imported custom, then bundled faces', () => {
    const catalog: FontCatalog = {
      families: [
        family('bundled', 'bundled'),
        family('custom', 'custom'),
        family('embedded', 'embedded')
      ]
    }
    expect(resolveFontFamily('Shared Family', catalog).family.id).toBe('embedded')
    catalog.families = catalog.families.filter((item) => item.id !== 'embedded')
    expect(resolveFontFamily('Shared Family', catalog).family.id).toBe('custom')
    catalog.families = catalog.families.filter((item) => item.id !== 'custom')
    expect(resolveFontFamily('Shared Family', catalog).family.id).toBe('bundled')
  })

  it('resolves bundled aliases without reporting a substitution', () => {
    const inter = { ...family('inter', 'bundled'), family: 'Inter' }
    const arimo = {
      ...family('arimo', 'bundled'),
      family: 'Arimo',
      aliases: ['Arial', 'Helvetica']
    }
    const result = resolveFontFamily('Arial', { families: [inter, arimo] })
    expect(result.family.id).toBe('arimo')
    expect(result.substituted).toBe(false)
  })

  it('substitutes Inter and lists every affected object when a font is missing', () => {
    const document = createDocument()
    const first = createObject('text', 0, 0)
    const second = createObject('text', 5, 5)
    if (first.kind !== 'text' || second.kind !== 'text') throw new Error('Expected text objects')
    first.name = 'Title'
    second.name = 'Serial'
    first.fontFamily = second.fontFamily = 'Missing Sans'
    document.template.design.objects.push(first, second)
    const inter = { ...family('inter', 'bundled'), family: 'Inter' }
    expect(missingFontWarnings(document, { families: [inter] })).toEqual([
      {
        requestedFamily: 'Missing Sans',
        substituteFamily: 'Inter',
        objectIds: [first.id, second.id],
        objectNames: ['Title', 'Serial']
      }
    ])
  })
})
