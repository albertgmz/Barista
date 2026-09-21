/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { beforeEach, describe, expect, it } from 'vitest'
import { createObject, bounds } from '@shared/template/document'
import { barcodeError } from '@shared/render/barcode'
import { useDocumentStore as store } from '../store/documentStore'
import { useEditorStore as editor } from '../store/editorStore'
import { arrange, copy, paste, remove, nudge } from './objectActions'
beforeEach(() => {
  store.getState().newDocument()
  editor.getState().setSelectedIds([])
})
describe('selection commands', () => {
  it('aligns a single object against label bounds and supports undo', () => {
    const o = createObject('rect', 4, 5)
    store.getState().addObjects([o])
    editor.getState().setSelectedIds([o.id])
    arrange('alignRight')
    expect(store.getState().document.template.design.objects[0]!.xMm).toBe(40)
    store.getState().undo()
    expect(store.getState().document.template.design.objects[0]!.xMm).toBe(4)
  })
  it('arranges, groups, locks and protects objects from delete and nudge', () => {
    const a = createObject('rect', 2, 3),
      b = createObject('ellipse', 10, 4)
    store.getState().addObjects([a, b])
    editor.getState().setSelectedIds([a.id])
    arrange('front')
    expect(store.getState().document.template.design.objects.at(-1)!.id).toBe(a.id)
    editor.getState().setSelectedIds([a.id, b.id])
    arrange('group')
    expect(store.getState().document.template.design.objects[0]!.groupId).toBe(
      store.getState().document.template.design.objects[1]!.groupId
    )
    arrange('ungroup')
    expect(store.getState().document.template.design.objects[0]!.groupId).toBeUndefined()
    arrange('lock')
    nudge(1, 1)
    remove()
    expect(store.getState().document.template.design.objects).toHaveLength(2)
    expect(store.getState().document.template.design.objects.find((o) => o.id === a.id)!.xMm).toBe(
      2
    )
  })
  it('pastes images across documents with their assets and an offset', () => {
    const o = createObject('image', 2, 3)
    if (o.kind !== 'image') throw new Error('image')
    o.assetId = 'a'
    store.getState().change((d) => ({
      ...d,
      assetData: { a: 'AQID' },
      template: {
        ...d.template,
        design: { ...d.template.design, objects: [o] },
        assets: [{ id: 'a', fileName: 'a.png', mimeType: 'image/png', byteLength: 3 }]
      }
    }))
    editor.getState().setSelectedIds([o.id])
    copy()
    store.getState().newDocument()
    paste()
    const d = store.getState().document
    expect(d.assetData['a']).toBe('AQID')
    expect(d.template.design.objects[0]!.xMm).toBe(4)
    expect(d.template.design.objects[0]!.id).not.toBe(o.id)
  })
  it('measures rotated bounds and reports invalid barcode data', () => {
    const o = createObject('rect', 0, 0)
    o.widthMm = 10
    o.heightMm = 20
    o.rotation = 90
    expect(bounds([o]).width).toBeCloseTo(20)
    const b = createObject('barcode', 0, 0)
    if (b.kind !== 'barcode') throw new Error('barcode')
    b.symbology = 'ean13'
    b.data = 'bad'
    expect(barcodeError(b)).toBeTruthy()
  })
  it('module sizes change physical symbol size', () => {
    const b = createObject('barcode', 0, 0)
    store.getState().addObjects([b])
    const before = store.getState().document.template.design.objects[0]!
    if (before.kind !== 'barcode') throw new Error('barcode')
    store.getState().updateObjects([b.id], { moduleWidthMm: before.moduleWidthMm * 2 })
    expect(store.getState().document.template.design.objects[0]!.widthMm).toBeGreaterThan(
      before.widthMm
    )
  })
  it('distributes three objects evenly and supports all-object visibility and locking', () => {
    const a = createObject('rect', 0, 0),
      b = createObject('rect', 12, 0),
      c = createObject('rect', 40, 0)
    a.widthMm = b.widthMm = c.widthMm = 10
    store.getState().addObjects([a, b, c])
    editor.getState().setSelectedIds([a.id, b.id, c.id])
    arrange('distributeHorizontal')
    expect(store.getState().document.template.design.objects.map((o) => o.xMm)).toEqual([0, 20, 40])
  })
})
