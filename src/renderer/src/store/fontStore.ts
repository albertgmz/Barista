/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { create } from 'zustand'
import type { FontCatalog, FontFaceInfo, FontFamilyInfo } from '@shared/fonts'
import type { FontReference } from '@shared/template/types'

interface FontState {
  catalog: FontCatalog
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  loadEmbedded: (fonts: FontReference[], fontData: Record<string, string>) => Promise<void>
}

const loadedFaces = new Set<string>()

function bytes(dataBase64: string): ArrayBuffer {
  const binary = window.atob(dataBase64)
  const data = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index)
  return data.buffer
}

async function registerFace(family: string, aliases: string[], face: FontFaceInfo): Promise<void> {
  for (const name of [family, ...aliases]) {
    const key = `${name}\0${face.id}`
    if (loadedFaces.has(key)) continue
    const loaded = await new FontFace(name, bytes(face.dataBase64), {
      style: face.style,
      weight: face.weight
    }).load()
    document.fonts.add(loaded)
    loadedFaces.add(key)
  }
}

async function registerFamily(family: FontFamilyInfo): Promise<void> {
  await Promise.all(family.faces.map((face) => registerFace(family.family, family.aliases, face)))
}

export const useFontStore = create<FontState>((set, get) => ({
  catalog: { families: [] },
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null })
    const result = await window.barista.invoke('fonts:list')
    if (!result.ok) {
      set({ loading: false, error: result.error.message })
      return
    }
    try {
      await Promise.all(result.value.families.map(registerFamily))
      set({ catalog: result.value, loading: false })
    } catch (error) {
      set({
        loading: false,
        error: `A font could not be loaded: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  },
  loadEmbedded: async (fonts, fontData) => {
    const embedded: FontFamilyInfo[] = fonts.flatMap((font) => {
      if (font.source !== 'embedded') return []
      const dataBase64 = fontData[font.id]
      if (!dataBase64) return []
      return [
        {
          id: font.id,
          family: font.family,
          aliases: [],
          source: 'embedded' as const,
          license: font.license,
          copyright: '',
          faces: [
            {
              id: `${font.id}-face`,
              fileName: font.fileName,
              mimeType: font.mimeType,
              style: font.style,
              weight: font.weight,
              byteLength: font.byteLength,
              embedding: font.embedding,
              noSubsetting: font.noSubsetting,
              dataBase64
            }
          ]
        }
      ]
    })
    await Promise.all(embedded.map(registerFamily))
    const current = get().catalog.families
    set({
      catalog: {
        families: [...embedded, ...current.filter((family) => family.source !== 'embedded')]
      }
    })
  }
}))
