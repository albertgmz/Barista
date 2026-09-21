/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { create as createFont, type Font, type FontCollection, type Os2Table } from 'fontkit'
import { z } from 'zod'
import type { FontCatalog, FontFaceInfo, FontFamilyInfo } from '@shared/fonts'
import type {
  FontEmbeddingPermission,
  FontFileMimeType,
  LabelDocument
} from '@shared/template/types'
import { userDataPaths } from './storage/paths'

interface BundledFamily {
  id: string
  family: string
  aliases: string[]
  license: string
  licenseUrl: string
  copyright: string
  faces: Array<{
    id: string
    path: string
    style: 'normal' | 'italic'
    weight: string
  }>
}

const BUNDLED_FAMILIES: readonly BundledFamily[] = [
  {
    id: 'inter',
    family: 'Inter',
    aliases: [],
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org/',
    copyright: 'Copyright 2016 The Inter Project Authors',
    faces: [
      { id: 'inter-roman', path: 'inter/Inter-Variable.ttf', style: 'normal', weight: '100 900' },
      {
        id: 'inter-italic',
        path: 'inter/Inter-Italic-Variable.ttf',
        style: 'italic',
        weight: '100 900'
      }
    ]
  },
  {
    id: 'arimo',
    family: 'Arimo',
    aliases: ['Arial', 'Helvetica'],
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org/',
    copyright: 'Copyright 2012 The Arimo Project Authors',
    faces: [
      { id: 'arimo-roman', path: 'arimo/Arimo-Variable.ttf', style: 'normal', weight: '400 700' },
      {
        id: 'arimo-italic',
        path: 'arimo/Arimo-Italic-Variable.ttf',
        style: 'italic',
        weight: '400 700'
      }
    ]
  },
  {
    id: 'roboto-condensed',
    family: 'Roboto Condensed',
    aliases: [],
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org/',
    copyright: 'Copyright 2011 The Roboto Project Authors',
    faces: [
      {
        id: 'roboto-condensed-roman',
        path: 'roboto-condensed/RobotoCondensed-Variable.ttf',
        style: 'normal',
        weight: '100 900'
      },
      {
        id: 'roboto-condensed-italic',
        path: 'roboto-condensed/RobotoCondensed-Italic-Variable.ttf',
        style: 'italic',
        weight: '100 900'
      }
    ]
  },
  {
    id: 'jetbrains-mono',
    family: 'JetBrains Mono',
    aliases: [],
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org/',
    copyright: 'Copyright 2020 The JetBrains Mono Project Authors',
    faces: [
      {
        id: 'jetbrains-mono-roman',
        path: 'jetbrains-mono/JetBrainsMono-Variable.ttf',
        style: 'normal',
        weight: '100 800'
      },
      {
        id: 'jetbrains-mono-italic',
        path: 'jetbrains-mono/JetBrainsMono-Italic-Variable.ttf',
        style: 'italic',
        weight: '100 800'
      }
    ]
  },
  {
    id: 'ocr-b',
    family: 'OCR-B',
    aliases: ['OCR B', 'OCRB'],
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org/',
    copyright: 'Copyright 2019 Raisty, with Reserved Font Name OCR-B',
    faces: [{ id: 'ocr-b-regular', path: 'ocr-b/OCR-B.ttf', style: 'normal', weight: '400' }]
  }
] as const

interface StoredFont {
  id: string
  family: string
  aliases: string[]
  license: string
  copyright: string
  face: Omit<FontFaceInfo, 'dataBase64'> & { storedName: string }
}

interface FontManagerOptions {
  bundledRoot?: string
  customRoot?: string
}

const storedFontSchema = z.object({
  id: z.string().min(1).max(200),
  family: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(200)).max(20),
  license: z.string().min(1).max(500),
  copyright: z.string().max(1000),
  face: z.object({
    id: z.string().min(1).max(200),
    fileName: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
    storedName: z.string().regex(/^[a-f0-9]{64}\.(ttf|otf|woff2)$/),
    mimeType: z.enum(['font/ttf', 'font/otf', 'font/woff2']),
    style: z.enum(['normal', 'italic']),
    weight: z.string().regex(/^\d{1,4}( \d{1,4})?$/),
    byteLength: z.number().int().positive().max(20_000_000),
    embedding: z.enum(['installable', 'editable', 'preview-print', 'restricted', 'bitmap-only']),
    noSubsetting: z.boolean()
  })
})

function isCollection(font: Font | FontCollection): font is FontCollection {
  return 'fonts' in font
}

function mimeForExtension(extension: string): FontFileMimeType {
  if (extension === '.ttf') return 'font/ttf'
  if (extension === '.otf') return 'font/otf'
  if (extension === '.woff2') return 'font/woff2'
  throw new Error('Choose a TrueType (.ttf), OpenType (.otf), or WOFF2 (.woff2) font.')
}

export function embeddingPermission(flags: Os2Table['fsType']): FontEmbeddingPermission {
  if (flags.bitmapOnly) return 'bitmap-only'
  if (flags.noEmbedding) return 'restricted'
  if (flags.editable) return 'editable'
  if (flags.viewOnly) return 'preview-print'
  return 'installable'
}

export function inspectFontBytes(
  bytes: Buffer,
  fileName: string
): {
  family: string
  copyright: string
  mimeType: FontFileMimeType
  style: 'normal' | 'italic'
  weight: string
  embedding: FontEmbeddingPermission
  noSubsetting: boolean
} {
  const mimeType = mimeForExtension(extname(fileName).toLowerCase())
  let parsed: Font | FontCollection
  try {
    parsed = createFont(bytes)
  } catch (error) {
    throw new Error(
      `The selected file is not a valid font: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
  if (isCollection(parsed))
    throw new Error('Font collections are not supported. Import one face at a time.')
  const flags = parsed['OS/2'].fsType
  const weightAxis = parsed.variationAxes['wght']
  return {
    family: parsed.familyName,
    copyright: parsed.copyright || 'Copyright information is not present in this font.',
    mimeType,
    style:
      parsed.italicAngle !== 0 || /italic|oblique/i.test(parsed.subfamilyName)
        ? 'italic'
        : 'normal',
    weight: weightAxis
      ? `${Math.round(weightAxis.min)} ${Math.round(weightAxis.max)}`
      : String(parsed['OS/2'].usWeightClass),
    embedding: embeddingPermission(flags),
    noSubsetting: flags.noSubsetting
  }
}

export class FontManager {
  constructor(private readonly options: FontManagerOptions = {}) {}

  async catalog(document?: LabelDocument): Promise<FontCatalog> {
    const [bundled, custom] = await Promise.all([this.bundledFamilies(), this.customFamilies()])
    return { families: [...this.embeddedFamilies(document), ...custom, ...bundled] }
  }

  async importFile(path: string): Promise<FontFamilyInfo> {
    const bytes = await readFile(path)
    if (bytes.length === 0 || bytes.length > 20_000_000)
      throw new Error('Custom fonts must be between 1 byte and 20 MB.')
    const inspected = inspectFontBytes(bytes, path)
    const hash = createHash('sha256').update(bytes).digest('hex')
    const extension = extname(path).toLowerCase()
    const id = `custom-${hash}`
    const root = this.customRoot()
    await mkdir(root, { recursive: true })
    const storedName = `${hash}${extension}`
    await writeFile(join(root, storedName), bytes, { flag: 'wx' }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      }
    )
    const stored: StoredFont = {
      id,
      family: inspected.family,
      aliases: [],
      license: 'User supplied — confirm the font license before distribution.',
      copyright: inspected.copyright,
      face: {
        id: `${id}-face`,
        fileName: basename(path),
        storedName,
        mimeType: inspected.mimeType,
        style: inspected.style,
        weight: inspected.weight,
        byteLength: bytes.length,
        embedding: inspected.embedding,
        noSubsetting: inspected.noSubsetting
      }
    }
    const index = await this.readIndex()
    await this.writeIndex([...index.filter((font) => font.id !== id), stored])
    return this.storedFamily(stored, bytes)
  }

  async remove(id: string): Promise<void> {
    const index = await this.readIndex()
    const target = index.find((font) => font.id === id)
    if (!target) return
    await this.writeIndex(index.filter((font) => font.id !== id))
    await unlink(join(this.customRoot(), target.face.storedName)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      }
    )
  }

  private bundledRoot(): string {
    if (this.options.bundledRoot) return this.options.bundledRoot
    return app.isPackaged
      ? join(process.resourcesPath, 'fonts')
      : join(app.getAppPath(), 'resources', 'fonts')
  }

  private customRoot(): string {
    return this.options.customRoot ?? userDataPaths().fontsDir
  }

  private async bundledFamilies(): Promise<FontFamilyInfo[]> {
    return Promise.all(
      BUNDLED_FAMILIES.map(async (family) => ({
        ...family,
        source: 'bundled' as const,
        faces: await Promise.all(
          family.faces.map(async (face) => {
            const bytes = await readFile(join(this.bundledRoot(), face.path))
            return {
              ...face,
              fileName: basename(face.path),
              mimeType: 'font/ttf' as const,
              byteLength: bytes.length,
              embedding: 'installable' as const,
              noSubsetting: false,
              dataBase64: bytes.toString('base64')
            }
          })
        )
      }))
    )
  }

  private async customFamilies(): Promise<FontFamilyInfo[]> {
    return Promise.all(
      (await this.readIndex()).map(async (font) =>
        this.storedFamily(font, await readFile(join(this.customRoot(), font.face.storedName)))
      )
    )
  }

  private storedFamily(font: StoredFont, bytes: Buffer): FontFamilyInfo {
    const { storedName: _storedName, ...face } = font.face
    return {
      id: font.id,
      family: font.family,
      aliases: font.aliases,
      source: 'custom',
      license: font.license,
      copyright: font.copyright,
      faces: [{ ...face, dataBase64: bytes.toString('base64') }]
    }
  }

  private embeddedFamilies(document?: LabelDocument): FontFamilyInfo[] {
    if (!document) return []
    return document.template.fonts.flatMap((font) => {
      if (font.source !== 'embedded') return []
      const dataBase64 = document.fontData[font.id]
      if (!dataBase64) return []
      const inspected = inspectFontBytes(Buffer.from(dataBase64, 'base64'), font.fileName)
      return [
        {
          id: font.id,
          family: font.family,
          aliases: [],
          source: 'embedded' as const,
          license: font.license,
          copyright: inspected.copyright,
          faces: [
            {
              id: `${font.id}-face`,
              fileName: font.fileName,
              mimeType: font.mimeType,
              style: inspected.style,
              weight: inspected.weight,
              byteLength: font.byteLength,
              embedding: font.embedding,
              noSubsetting: inspected.noSubsetting,
              dataBase64
            }
          ]
        }
      ]
    })
  }

  private async readIndex(): Promise<StoredFont[]> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(this.customRoot(), 'index.json'), 'utf8')
      )
      return z.array(storedFontSchema).max(100).parse(parsed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  private async writeIndex(fonts: StoredFont[]): Promise<void> {
    const root = this.customRoot()
    await mkdir(root, { recursive: true })
    const target = join(root, 'index.json')
    const temporary = `${target}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(fonts, null, 2))
    await rename(temporary, target)
  }
}

export const fontManager = new FontManager()

export function listInstalledFonts(document?: LabelDocument): Promise<FontCatalog> {
  return fontManager.catalog(document)
}

export async function fontFaceCss(document?: LabelDocument): Promise<string> {
  const catalog = await fontManager.catalog(document)
  return [...catalog.families]
    .reverse()
    .flatMap((family) =>
      family.faces.flatMap((face) =>
        [family.family, ...family.aliases].map(
          (name) =>
            `@font-face{font-family:"${name.replace(/["'\\<>]/g, '')}";src:url(data:${face.mimeType};base64,${face.dataBase64});font-style:${face.style};font-weight:${face.weight};font-display:block}`
        )
      )
    )
    .join('')
}
