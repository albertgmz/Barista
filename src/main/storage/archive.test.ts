/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate'
import { createDocument, createObject } from '@shared/template/document'
import { encodeArchive, decodeArchive, decodeArchiveResult } from './archive'
const PREVIEW = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const encode = (document: ReturnType<typeof createDocument>, appVersion?: string): Uint8Array =>
  encodeArchive(document, { appVersion, previewPng: PREVIEW })
describe('bar archives', () => {
  it('round trips the document and asset bytes', () => {
    const d = createDocument(),
      image = createObject('image', 3, 4)
    if (image.kind !== 'image') throw new Error('Expected image')
    image.assetId = 'logo'
    d.template.design.guides.push({ id: 'guide-x', axis: 'x', positionMm: 12.345, locked: true })
    d.template.variables.push({
      id: 'equipment',
      name: 'equipment',
      kind: 'prompt',
      label: 'Equipment number',
      defaultValue: 'D530',
      required: true,
      maxLength: 20,
      options: [],
      pattern: '^[A-Z0-9]+$'
    })
    d.template.design.objects.push(image)
    d.template.assets.push({
      id: 'logo',
      fileName: 'logo.png',
      mimeType: 'image/png',
      byteLength: 3
    })
    d.assetData['logo'] = Buffer.from([1, 2, 3]).toString('base64')
    expect(decodeArchive(encode(d))).toEqual(d)
  })
  it('writes the versioned manifest and label using deterministic bytes', () => {
    const document = createDocument()
    const first = encode(document, '1.2.3')
    const second = encode(document, '1.2.3')
    expect(first).toEqual(second)
    const entries = unzipSync(first)
    expect(Object.keys(entries)).toEqual(['manifest.json', 'label.json', 'preview.png'])
    expect(JSON.parse(strFromU8(entries['manifest.json']!))).toMatchObject({
      format: 'Barista Label',
      formatVersion: 2,
      appVersion: '1.2.3'
    })
  })
  it('deduplicates identical assets by content hash', () => {
    const document = createDocument()
    document.template.assets.push(
      { id: 'one', fileName: 'one.png', mimeType: 'image/png', byteLength: 3 },
      { id: 'two', fileName: 'two.png', mimeType: 'image/png', byteLength: 3 }
    )
    const data = Buffer.from([1, 2, 3]).toString('base64')
    document.assetData = { one: data, two: data }
    const entries = unzipSync(encode(document))
    expect(Object.keys(entries).filter((name) => name.startsWith('assets/'))).toHaveLength(1)
    expect(decodeArchive(encode(document))).toEqual(document)
  })
  it('round trips an embedded custom font under assets/fonts', () => {
    const document = createDocument()
    const bytes = Buffer.from([0, 1, 2, 3, 4])
    document.template.fonts.push({
      id: 'font-custom',
      family: 'Shop Sans',
      license: 'Customer supplied',
      copyright: 'Copyright Shop Sans',
      style: 'normal',
      weight: '400',
      noSubsetting: false,
      source: 'embedded',
      fileName: 'shop-sans.ttf',
      mimeType: 'font/ttf',
      byteLength: bytes.length,
      embedding: 'editable'
    })
    document.fontData['font-custom'] = bytes.toString('base64')
    const archive = encode(document)
    const entries = unzipSync(archive)
    expect(Object.keys(entries).some((path) => path.startsWith('assets/fonts/'))).toBe(true)
    expect(decodeArchive(archive)).toEqual(document)
  })
  it('opens a compatible future format read-only with a warning', () => {
    const entries = unzipSync(encode(createDocument()))
    const manifest = JSON.parse(strFromU8(entries['manifest.json']!))
    manifest.formatVersion = 3
    const result = decodeArchiveResult(
      zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        'label.json': entries['label.json']!
      })
    )
    expect(result.readOnly).toBe(true)
    expect(result.warning).toContain('newer version')
  })
  it('rejects version 1 bar archives with a clear compatibility message', () => {
    const now = new Date().toISOString()
    expect(() =>
      decodeArchiveResult(
        zipSync({
          'manifest.json': strToU8(
            JSON.stringify({
              format: 'Barista Label',
              formatVersion: 1,
              appVersion: '0.2.0',
              createdAt: now,
              modifiedAt: now,
              assets: []
            })
          ),
          'label.json': strToU8(
            JSON.stringify({
              version: 1,
              id: 'legacy-v1',
              name: 'Migrated v1',
              size: { widthMm: 50, heightMm: 25, dpi: 203 },
              variables: [],
              guides: [],
              objects: [createObject('text', 2, 3)],
              assets: [],
              metadata: { createdAt: now, modifiedAt: now, author: '', description: '' }
            })
          )
        })
      )
    ).toThrow('version 1 is no longer supported')
  })
  it('rejects a damaged embedded preview', () => {
    const entries = unzipSync(encode(createDocument()))
    const preview = entries['preview.png']!
    preview[0] = preview[0]! ^ 0xff
    expect(() => decodeArchive(zipSync(entries))).toThrow('preview checksum')
  })
  it('rejects legacy plabel archives with a clear compatibility message', () => {
    const document = createDocument()
    const legacy = {
      version: 1,
      id: document.template.id,
      name: 'Legacy equipment label',
      size: { widthMm: 60, heightMm: 35, dpi: 300, cornerRadiusMm: 1 },
      variables: [],
      guides: [],
      objects: [],
      assets: [],
      metadata: {
        createdAt: document.template.metadata.createdAt,
        modifiedAt: document.template.metadata.modifiedAt,
        author: 'Pat',
        description: 'Imported'
      }
    }
    expect(() =>
      decodeArchiveResult(zipSync({ 'template.json': strToU8(JSON.stringify(legacy)) }))
    ).toThrow('.plabel files are no longer supported')
  })
  it('rejects corrupt ZIPs, unsupported versions, missing and unsafe entries', () => {
    expect(() => decodeArchive(new Uint8Array([1, 2, 3]))).toThrow()
    expect(() => decodeArchive(zipSync({}))).toThrow('manifest.json')
    const d = createDocument()
    d.template.version = 99
    expect(() =>
      decodeArchive(
        zipSync({
          'manifest.json': strToU8(
            JSON.stringify({
              format: 'Barista Label',
              formatVersion: 3,
              appVersion: '1',
              createdAt: new Date().toISOString(),
              modifiedAt: new Date().toISOString(),
              assets: []
            })
          ),
          'label.json': strToU8(JSON.stringify(d.template))
        })
      )
    ).toThrow('Invalid label')
    expect(() => decodeArchive(zipSync({ '../escape': new Uint8Array([1]) }))).toThrow('unsafe')
    expect(() =>
      decodeArchive(
        zipSync({
          'manifest.json': [strToU8('target'), { os: 3, attrs: 0o120777 << 16 }]
        })
      )
    ).toThrow('symlinks')
    expect(() =>
      decodeArchive(zipSync({ 'manifest.json': new Uint8Array(1_100_000) }, { level: 9 }))
    ).toThrow('too large')
  })
  it('rejects invalid geometry and references', () => {
    const d = createDocument()
    d.template.design.objects.push(createObject('image', 0, 0))
    expect(() => encode(d)).toThrow()
    d.template.design.objects = [createObject('text', 0, 0)]
    d.template.design.objects[0]!.widthMm = NaN
    expect(() => encode(d)).toThrow()
  })
})
