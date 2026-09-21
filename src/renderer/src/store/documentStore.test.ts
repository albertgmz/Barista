/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { createDocument, createObject } from '@shared/template/document'
import { useDocumentStore } from './documentStore'

describe('document history', () => {
  it('merges a continuous edit and restores the saved dirty state', () => {
    const s = useDocumentStore
    s.getState().newDocument()
    const object = createObject('rect', 2, 3)
    s.getState().addObjects([object])
    s.getState().markClean()
    s.getState().beginGesture()
    s.getState().updateObjects([object.id], { xMm: 5 })
    s.getState().updateObjects([object.id], { xMm: 9 })
    s.getState().endGesture()
    expect(s.getState().isDirty).toBe(true)
    s.getState().undo()
    expect(s.getState().document.template.design.objects[0]?.xMm).toBe(2)
    expect(s.getState().isDirty).toBe(false)
    s.getState().redo()
    expect(s.getState().document.template.design.objects[0]?.xMm).toBe(9)
  })
  it('bounds history, clears redo on branches and ignores no-ops', () => {
    const s = useDocumentStore
    s.getState().loadDocument(createDocument(), null)
    s.getState().setHistoryLimit(2)
    for (const widthMm of [61, 62, 63]) s.getState().setLabelStock({ widthMm })
    expect(s.getState().past).toHaveLength(2)
    s.getState().undo()
    s.getState().setLabelStock({ widthMm: 70 })
    expect(s.getState().future).toHaveLength(0)
    const count = s.getState().past.length
    s.getState().setLabelStock({ widthMm: 70 })
    expect(s.getState().past).toHaveLength(count)
    s.getState().setHistoryLimit(100)
  })
})

describe('geometry precision', () => {
  it('does not drift after 1000 nudges and undo cycles', () => {
    const s = useDocumentStore
    s.getState().newDocument()
    s.getState().setHistoryLimit(1100)
    const object = createObject('rect', 1, 2)
    s.getState().addObjects([object])
    for (let index = 0; index < 1000; index += 1)
      s.getState().updateObjects([object.id], {
        xMm: s.getState().document.template.design.objects[0]!.xMm + 0.1
      })
    expect(s.getState().document.template.design.objects[0]!.xMm).toBe(101)
    for (let index = 0; index < 1000; index += 1) s.getState().undo()
    expect(s.getState().document.template.design.objects[0]!.xMm).toBe(1)
    s.getState().setHistoryLimit(100)
  })
})
