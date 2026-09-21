/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { embeddingPermission, inspectFontBytes } from './fonts'

const flags = (overrides: Partial<Parameters<typeof embeddingPermission>[0]> = {}) => ({
  bitmapOnly: false,
  editable: false,
  noEmbedding: false,
  noSubsetting: false,
  viewOnly: false,
  ...overrides
})

describe('font embedding permission', () => {
  it('maps every OS/2 fsType permission without treating restricted fonts as embeddable', () => {
    expect(embeddingPermission(flags())).toBe('installable')
    expect(embeddingPermission(flags({ editable: true }))).toBe('editable')
    expect(embeddingPermission(flags({ viewOnly: true }))).toBe('preview-print')
    expect(embeddingPermission(flags({ noEmbedding: true }))).toBe('restricted')
    expect(embeddingPermission(flags({ bitmapOnly: true }))).toBe('bitmap-only')
  })

  it('reads family, style, weight, and fsType from a real bundled variable font', async () => {
    const path = join(process.cwd(), 'resources', 'fonts', 'inter', 'Inter-Variable.ttf')
    const inspected = inspectFontBytes(await readFile(path), path)
    expect(inspected).toMatchObject({
      family: 'Inter',
      mimeType: 'font/ttf',
      style: 'normal',
      weight: '100 900',
      embedding: 'installable'
    })
  })
})
