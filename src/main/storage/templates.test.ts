/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createDocument, createObject } from '@shared/template/document'
import { DEFAULT_PRINT_SETTINGS } from '@shared/printSettings'
import type { CounterVariable, LabelDocument } from '@shared/template/types'
import { renderLabelSvg } from '@main/printing/labelSvg'
import { decodeArchive, readArchivePreview } from './archive'
import { TemplateStore } from './templates'

const roots: string[] = []
const PREVIEW = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
async function store(
  renderPreview: (document: LabelDocument) => Promise<Uint8Array> = async () => PREVIEW
): Promise<{ root: string; store: TemplateStore }> {
  const root = await mkdtemp(join(tmpdir(), 'barista-template-test-'))
  roots.push(root)
  return { root, store: new TemplateStore({ root, appVersion: 'test', renderPreview }) }
}

/** The stored thumbnail, which `readArchivePreview` has already checked is a PNG. */
async function savedPreview(path: string): Promise<Uint8Array> {
  const preview = readArchivePreview(await readFile(path))
  if (!preview) throw new Error('The saved archive has no preview.')
  return preview
}

/** The save-path preview of src/main/ipc/templateIpc.ts, without the rasterizer. */
async function previewThroughRenderer(document: LabelDocument): Promise<Uint8Array> {
  renderLabelSvg(document, DEFAULT_PRINT_SETTINGS, { sample: true })
  return PREVIEW
}

function barcodeLabel(data: string, variables: CounterVariable[] = []): LabelDocument {
  const document = createDocument()
  const barcode = createObject('barcode', 2, 2)
  if (barcode.kind !== 'barcode') throw new Error('Expected a barcode')
  document.template.variables = variables
  document.template.design.objects = [{ ...barcode, symbology: 'ean13', data }]
  return document
}

const SERIAL: CounterVariable = {
  id: 'serial',
  name: 'serial',
  kind: 'counter',
  start: 1,
  step: 1,
  // EAN-13 takes 12 or 13 digits, so the counter is padded to a legal length.
  padding: 12,
  padChar: '0',
  prefix: '',
  suffix: '',
  scope: 'template',
  sharedName: '',
  format: 'numeric',
  alphabet: '0123456789',
  min: 0,
  max: 999999999999,
  overflow: 'stop',
  reset: 'never',
  failure: 'void'
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))))

describe('TemplateStore', () => {
  it('atomically saves a bar file and backs up the previous version', async () => {
    const { root, store: templates } = await store()
    const path = join(root, 'label.bar')
    const original = createDocument()
    await templates.write(path, original)
    const changed = structuredClone(original)
    changed.template.design.objects.push(createObject('text', 1, 2))
    await templates.write(path, changed)
    expect((await templates.read(path)).document).toEqual(changed)
    expect(decodeArchive(await readFile(`${path}.bak`))).toEqual(original)
  })

  it('saves a label whose barcode data is still a variable', async () => {
    const { root, store: templates } = await store(previewThroughRenderer)
    const path = join(root, 'serial.bar')
    const document = barcodeLabel('{serial}', [SERIAL])
    await templates.write(path, document)
    expect((await templates.read(path)).document).toEqual(document)
    expect(Buffer.from(await savedPreview(path))).toEqual(PREVIEW)
  })

  it('saves the label even when its preview cannot be rendered', async () => {
    const { root, store: templates } = await store(previewThroughRenderer)
    const path = join(root, 'unencodable.bar')
    // Valid to store, impossible to encode: EAN-13 rejects letters.
    const document = barcodeLabel('not-a-number')
    await templates.write(path, document)
    expect((await templates.read(path)).document).toEqual(document)
    // The renderer never returned, so the archive holds the blank stand-in.
    const preview = Buffer.from(await savedPreview(path))
    expect(preview).not.toEqual(PREVIEW)
    expect([preview.readUInt32BE(16), preview.readUInt32BE(20)]).toEqual([1, 1])
  })

  it('keeps the previous thumbnail when a re-save cannot render a new one', async () => {
    const { root, store: templates } = await store(previewThroughRenderer)
    const path = join(root, 'edited.bar')
    await templates.write(path, barcodeLabel('5901234123457'))
    const broken = barcodeLabel('not-a-number')
    await templates.write(path, broken)
    expect((await templates.read(path)).document).toEqual(broken)
    expect(Buffer.from(await savedPreview(path))).toEqual(PREVIEW)
  })

  it('round trips and discards an autosave recovery record', async () => {
    const { store: templates } = await store()
    const document = createDocument()
    await templates.writeRecovery(document, 'C:\\labels\\source.bar')
    const recovery = await templates.readRecovery()
    expect(recovery?.document).toEqual(document)
    expect(recovery?.originalPath).toBe('C:\\labels\\source.bar')
    await templates.discardRecovery()
    expect(await templates.readRecovery()).toBeNull()
  })
})
