/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { reconcileSymbol } from '@shared/template/symbolGeometry'
import { create } from 'zustand'
import type { LabelDocument, LabelObject, LabelStock } from '@shared/template/types'
import {
  createDocument,
  DEFAULT_STOCK,
  quantizeDocumentGeometry,
  constrainObjectToStock,
  type ObjectPatch
} from '@shared/template/document'
import { useEditorStore } from './editorStore'
export const DEFAULT_LABEL_SIZE: LabelStock = DEFAULT_STOCK
interface DocumentState {
  document: LabelDocument
  labelSize: LabelStock
  filePath: string | null
  fileName: string
  fileReadOnly: boolean
  isDirty: boolean
  saved: LabelDocument
  past: LabelDocument[]
  future: LabelDocument[]
  historyLimit: number
  gesture: LabelDocument | null
  newDocument: () => void
  loadDocument: (
    document: LabelDocument,
    path: string | null,
    options?: { readOnly?: boolean; recovered?: boolean }
  ) => void
  change: (update: (document: LabelDocument) => LabelDocument) => void
  addObjects: (objects: LabelObject[]) => void
  updateObjects: (ids: string[], patch: ObjectPatch, includeLocked?: boolean) => void
  removeObjects: (ids: string[]) => void
  setLabelStock: (size: Partial<LabelStock>) => void
  setFilePath: (path: string | null) => void
  markDirty: () => void
  markClean: (saved?: LabelDocument) => void
  completeSave: (document: LabelDocument) => void
  beginGesture: () => void
  endGesture: () => void
  undo: () => void
  redo: () => void
  setHistoryLimit: (limit: number) => void
}
const equal = (a: LabelDocument, b: LabelDocument): boolean => {
  if (a === b) return true
  const assetsEqual =
    a.assetData === b.assetData ||
    (Object.keys(a.assetData).length === Object.keys(b.assetData).length &&
      Object.entries(a.assetData).every(([id, data]) => b.assetData[id] === data))
  return assetsEqual && JSON.stringify(a.template) === JSON.stringify(b.template)
}
const fileName = (path: string | null): string => path?.split(/[\\/]/).pop() ?? 'Untitled'
const initial = createDocument()
export const useDocumentStore = create<DocumentState>((set, get) => ({
  document: initial,
  saved: initial,
  labelSize: initial.template.stock,
  filePath: null,
  fileName: 'Untitled',
  fileReadOnly: false,
  isDirty: false,
  past: [],
  future: [],
  historyLimit: 100,
  gesture: null,
  loadDocument: (document, filePath, options = {}) =>
    set({
      document,
      saved: document,
      labelSize: document.template.stock,
      filePath,
      fileName: fileName(filePath),
      fileReadOnly: options.readOnly ?? false,
      isDirty: options.recovered ?? false,
      past: [],
      future: [],
      gesture: null
    }),
  newDocument: () => get().loadDocument(createDocument(), null),
  change: (update) =>
    set((s) => {
      if (s.fileReadOnly) return s
      const next = update(s.document)
      const nextWithConstraints = useEditorStore.getState().keepObjectsInsideLabel
        ? {
            ...next,
            template: {
              ...next.template,
              design: {
                ...next.template.design,
                objects: next.template.design.objects.map((object) =>
                  constrainObjectToStock(object, next.template.stock)
                )
              }
            }
          }
        : next
      const document = quantizeDocumentGeometry({
        ...nextWithConstraints,
        template: {
          ...nextWithConstraints.template,
          design: {
            ...nextWithConstraints.template.design,
            objects: nextWithConstraints.template.design.objects.map((o, zIndex) => ({
              ...o,
              zIndex
            }))
          }
        }
      })
      if (equal(document, s.document)) return s
      return {
        document,
        labelSize: document.template.stock,
        isDirty: !equal(document, s.saved),
        future: [],
        past: s.gesture ? s.past : [...s.past, s.document].slice(-s.historyLimit)
      }
    }),
  addObjects: (objects) =>
    get().change((d) => ({
      ...d,
      template: {
        ...d.template,
        design: {
          ...d.template.design,
          objects: [...d.template.design.objects, ...objects.map((o) => reconcileSymbol(o))]
        }
      }
    })),
  updateObjects: (ids, patch, includeLocked = false) =>
    get().change((d) => ({
      ...d,
      template: {
        ...d.template,
        design: {
          ...d.template.design,
          objects: d.template.design.objects.map((o) =>
            ids.includes(o.id) && (includeLocked || !o.locked)
              ? reconcileSymbol({ ...o, ...patch } as LabelObject, o)
              : o
          )
        }
      }
    })),
  removeObjects: (ids) =>
    get().change((d) => ({
      ...d,
      template: {
        ...d.template,
        design: {
          ...d.template.design,
          objects: d.template.design.objects.filter((o) => !ids.includes(o.id) || o.locked)
        }
      }
    })),
  setLabelStock: (size) =>
    get().change((d) => ({
      ...d,
      template: { ...d.template, stock: { ...d.template.stock, ...size } }
    })),
  setFilePath: (filePath) => set({ filePath, fileName: fileName(filePath), fileReadOnly: false }),
  markDirty: () => set({ isDirty: true }),
  markClean: (saved) => {
    get().endGesture()
    set((s) => ({ saved: saved ?? s.document, isDirty: !equal(saved ?? s.document, s.document) }))
  },
  completeSave: (document) =>
    set({
      document,
      saved: document,
      labelSize: document.template.stock,
      isDirty: false,
      gesture: null
    }),
  beginGesture: () => {
    if (!get().gesture) set({ gesture: get().document })
  },
  endGesture: () =>
    set((s) => ({
      gesture: null,
      past:
        s.gesture && !equal(s.gesture, s.document)
          ? [...s.past, s.gesture].slice(-s.historyLimit)
          : s.past
    })),
  undo: () => {
    get().endGesture()
    set((s) => {
      const document = s.past.at(-1)
      return document
        ? {
            document,
            labelSize: document.template.stock,
            past: s.past.slice(0, -1),
            future: [s.document, ...s.future],
            isDirty: !equal(document, s.saved)
          }
        : s
    })
  },
  redo: () => {
    get().endGesture()
    set((s) => {
      const document = s.future[0]
      return document
        ? {
            document,
            labelSize: document.template.stock,
            past: [...s.past, s.document].slice(-s.historyLimit),
            future: s.future.slice(1),
            isDirty: !equal(document, s.saved)
          }
        : s
    })
  },
  setHistoryLimit: (historyLimit) => {
    if (Number.isInteger(historyLimit) && historyLimit > 0 && historyLimit <= 5000)
      set((s) => ({ historyLimit, past: s.past.slice(-historyLimit) }))
  }
}))
