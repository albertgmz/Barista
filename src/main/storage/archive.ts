/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { createHash } from 'node:crypto'
import { documentSchema, templateSchema } from '@shared/template/schema'
import type { LabelDocument } from '@shared/template/types'
import { barManifestSchema, formatZodError } from '@shared/format/schema'
import { migrateBarArchive } from '@shared/format/migrations'
import { stableJson } from '@shared/format/stableJson'
import {
  BAR_FORMAT_NAME,
  BAR_FORMAT_VERSION,
  type BarAssetEntry,
  type BarFontEntry,
  type BarManifest,
  type OpenedLabel
} from '@shared/format/types'
const LIMIT = 100 * 1024 * 1024
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

function assertNoZipSymlinks(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue
    const externalAttributes = view.getUint32(offset + 38, true)
    const unixMode = externalAttributes >>> 16
    if ((unixMode & 0xf000) === 0xa000) throw new Error('Label archives may not contain symlinks.')
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    offset += 45 + nameLength + extraLength + commentLength
  }
}

function assertPng(bytes: Uint8Array): void {
  if (
    bytes.length < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
  )
    throw new Error('The embedded preview is not a PNG image.')
}

function readEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.length > LIMIT) throw new Error('Label archive exceeds 100 MB.')
  assertNoZipSymlinks(bytes)
  let total = 0
  let count = 0
  try {
    return unzipSync(bytes, {
      filter: (file) => {
        count += 1
        total += file.originalSize
        if (
          count > 1000 ||
          total > LIMIT ||
          file.originalSize > 20 * 1024 * 1024 ||
          (file.originalSize > 1_000_000 && file.originalSize > Math.max(1, file.size) * 100) ||
          total > Math.max(bytes.length * 100, 1_000_000)
        )
          throw new Error('Expanded label archive is too large.')
        if (
          !['manifest.json', 'label.json', 'template.json', 'preview.png'].includes(file.name) &&
          !/^assets\/(?:fonts\/)?[a-zA-Z0-9_.-]+$/.test(file.name)
        )
          throw new Error('Unexpected or unsafe archive entry.')
        return true
      }
    })
  } catch (e) {
    throw new Error(`Cannot open label ZIP: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e
    })
  }
}

function parseJson(entry: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(strFromU8(entry))
  } catch (error) {
    throw new Error(
      `${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}

function parseTemplate(value: unknown): LabelDocument['template'] {
  const result = templateSchema.safeParse(value)
  if (!result.success) throw formatZodError('Invalid label', result.error)
  return result.data
}

export function decodeArchiveResult(bytes: Uint8Array): OpenedLabel {
  const entries = readEntries(bytes)
  if (!entries['manifest.json'] && entries['template.json'])
    throw new Error(
      '.plabel files are no longer supported. Barista 0.4 opens version 2 .bar files only.'
    )
  if (!entries['manifest.json'] || !entries['label.json'])
    throw new Error('The archive is partial: manifest.json and label.json are both required.')

  const parsedManifest = barManifestSchema.safeParse(
    parseJson(entries['manifest.json'], 'manifest.json')
  )
  if (!parsedManifest.success)
    throw formatZodError('Invalid Barista label manifest', parsedManifest.error)
  const sourceVersion = parsedManifest.data.formatVersion
  if (sourceVersion < BAR_FORMAT_VERSION)
    throw new Error(
      `Barista label format version ${sourceVersion} is no longer supported. Barista 0.4 opens version 2 .bar files only.`
    )
  if (sourceVersion === BAR_FORMAT_VERSION) {
    const preview = parsedManifest.data.preview
    if (!preview) throw new Error('The version 2 archive is missing its preview manifest entry.')
    const previewBytes = entries[preview.path]
    if (!previewBytes || previewBytes.length !== preview.byteLength)
      throw new Error('The embedded preview is missing or damaged.')
    if (createHash('sha256').update(previewBytes).digest('hex') !== preview.sha256)
      throw new Error('The embedded preview checksum failed.')
    assertPng(previewBytes)
  }
  const migrated = migrateBarArchive({
    manifest: parsedManifest.data,
    label: parseJson(entries['label.json'], 'label.json')
  })
  const template = parseTemplate(migrated.label)
  const assetData: Record<string, string> = {}
  const manifestAssets = new Map(migrated.manifest.assets.map((asset) => [asset.id, asset]))
  for (const asset of template.assets) {
    const manifestAsset = manifestAssets.get(asset.id)
    if (!manifestAsset) throw new Error(`The manifest is missing asset ${asset.id}.`)
    const assetBytes = entries[manifestAsset.path]
    if (!assetBytes || assetBytes.length !== manifestAsset.byteLength)
      throw new Error(`Missing or damaged asset: ${asset.fileName}`)
    const hash = createHash('sha256').update(assetBytes).digest('hex')
    if (hash !== manifestAsset.sha256) throw new Error(`Asset checksum failed: ${asset.fileName}`)
    assetData[asset.id] = Buffer.from(assetBytes).toString('base64')
  }
  const fontData: Record<string, string> = {}
  const manifestFonts = new Map((migrated.manifest.fonts ?? []).map((font) => [font.id, font]))
  for (const font of template.fonts) {
    if (font.source !== 'embedded') continue
    const manifestFont = manifestFonts.get(font.id)
    if (!manifestFont) throw new Error(`The manifest is missing embedded font ${font.family}.`)
    const fontBytes = entries[manifestFont.path]
    if (!fontBytes || fontBytes.length !== manifestFont.byteLength)
      throw new Error(`Missing or damaged embedded font: ${font.fileName}`)
    const hash = createHash('sha256').update(fontBytes).digest('hex')
    if (hash !== manifestFont.sha256)
      throw new Error(`Embedded font checksum failed: ${font.fileName}`)
    fontData[font.id] = Buffer.from(fontBytes).toString('base64')
  }
  const newer = migrated.manifest.formatVersion > BAR_FORMAT_VERSION
  return {
    document: documentSchema.parse({ template, assetData, fontData }),
    readOnly: newer,
    warning: newer
      ? `This label uses newer version ${migrated.manifest.formatVersion}. It is open read-only to protect its data.`
      : undefined
  }
}

export function decodeArchive(bytes: Uint8Array): LabelDocument {
  return decodeArchiveResult(bytes).document
}

/** Returns the already-validated embedded thumbnail bytes, when the archive has one. */
export function readArchivePreview(bytes: Uint8Array): Uint8Array | null {
  const entries = readEntries(bytes)
  const preview = entries['preview.png']
  if (!preview) return null
  assertPng(preview)
  return preview
}

const extensionForMime = (mimeType: BarAssetEntry['mimeType']): string =>
  mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : 'svg'

const extensionForFontMime = (mimeType: BarFontEntry['mimeType']): string =>
  mimeType === 'font/ttf' ? 'ttf' : mimeType === 'font/otf' ? 'otf' : 'woff2'

export function encodeArchive(
  document: LabelDocument,
  options: { appVersion?: string; previewPng: Uint8Array }
): Uint8Array {
  const d = documentSchema.parse(document)
  assertPng(options.previewPng)
  if (options.previewPng.length > 5_000_000) throw new Error('The embedded preview exceeds 5 MB.')
  const entries: Record<string, Uint8Array> = {}
  const assets: BarAssetEntry[] = []
  const fonts: BarFontEntry[] = []
  let total = 0
  for (const asset of d.template.assets) {
    const data = d.assetData[asset.id]
    if (!data) throw new Error(`Missing asset bytes: ${asset.fileName}`)
    const bytes = Buffer.from(data, 'base64')
    if (bytes.length !== asset.byteLength) throw new Error(`Damaged asset: ${asset.fileName}`)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const path = `assets/${sha256}.${extensionForMime(asset.mimeType)}`
    entries[path] ??= bytes
    assets.push({
      id: asset.id,
      path,
      sha256,
      mimeType: asset.mimeType,
      byteLength: bytes.length
    })
    total += entries[path] === bytes ? bytes.length : 0
  }
  for (const font of d.template.fonts) {
    if (font.source !== 'embedded') continue
    const data = d.fontData[font.id]
    if (!data) throw new Error(`Missing embedded font bytes: ${font.fileName}`)
    const bytes = Buffer.from(data, 'base64')
    if (bytes.length !== font.byteLength) throw new Error(`Damaged embedded font: ${font.fileName}`)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const path = `assets/fonts/${sha256}.${extensionForFontMime(font.mimeType)}`
    entries[path] ??= bytes
    fonts.push({
      id: font.id,
      path,
      sha256,
      mimeType: font.mimeType,
      byteLength: bytes.length
    })
    total += entries[path] === bytes ? bytes.length : 0
  }
  const manifest: BarManifest = {
    format: BAR_FORMAT_NAME,
    formatVersion: BAR_FORMAT_VERSION,
    appVersion: options.appVersion ?? '0.0.0',
    createdAt: d.template.metadata.createdAt,
    modifiedAt: d.template.metadata.modifiedAt,
    assets,
    fonts,
    preview: {
      path: 'preview.png',
      sha256: createHash('sha256').update(options.previewPng).digest('hex'),
      mimeType: 'image/png',
      byteLength: options.previewPng.length
    }
  }
  const ordered: Record<string, Uint8Array> = {
    'manifest.json': strToU8(stableJson(manifest)),
    'label.json': strToU8(stableJson(d.template)),
    'preview.png': options.previewPng
  }
  for (const path of Object.keys(entries).sort()) ordered[path] = entries[path]!
  total +=
    ordered['manifest.json']!.length +
    ordered['label.json']!.length +
    ordered['preview.png']!.length
  if (total > LIMIT) throw new Error('Label exceeds 100 MB.')
  return zipSync(ordered, { level: 6, mtime: new Date('1980-01-02T00:00:00.000Z') })
}
