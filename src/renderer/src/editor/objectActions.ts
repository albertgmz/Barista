/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { bounds, createObject, newId } from '@shared/template/document'
import type { LabelObject, AssetRef } from '@shared/template/types'
import { useDocumentStore } from '../store/documentStore'
import { useEditorStore } from '../store/editorStore'
import { useFontStore } from '../store/fontStore'
import { applyFontFamily } from './fontActions'
let clipboard: LabelObject[] = []
let clipboardAssets: AssetRef[] = []
let clipboardData: Record<string, string> = {}
let clipboardText = ''
let clipboardToken = ''
export const canPaste = (): boolean => clipboard.length > 0
export function selection(): LabelObject[] {
  const ids = useEditorStore.getState().selectedIds
  return useDocumentStore
    .getState()
    .document.template.design.objects.filter((o) => ids.includes(o.id))
}
export function copy(): void {
  clipboard = structuredClone(selection())
  const d = useDocumentStore.getState().document
  const ids = clipboard.filter((o) => o.kind === 'image').map((o) => o.assetId)
  clipboardAssets = d.template.assets.filter((a) => ids.includes(a.id))
  clipboardData = Object.fromEntries(clipboardAssets.map((a) => [a.id, d.assetData[a.id]!]))
  clipboardText = clipboard
    .map((object) =>
      object.kind === 'text'
        ? object.text
        : object.kind === 'barcode' || object.kind === 'qrcode'
          ? object.data
          : object.name
    )
    .join('\n')
}
export function paste(inPlace = false): void {
  const groups = new Map<string, string>()
  const objects = clipboard.map((o) => {
    if (o.groupId && !groups.has(o.groupId)) groups.set(o.groupId, newId())
    return {
      ...o,
      id: newId(),
      groupId: o.groupId ? groups.get(o.groupId) : undefined,
      locked: false,
      xMm: o.xMm + (inPlace ? 0 : 2),
      yMm: o.yMm + (inPlace ? 0 : 2)
    }
  })
  useDocumentStore.getState().change((d) => ({
    ...d,
    assetData: { ...d.assetData, ...clipboardData },
    template: {
      ...d.template,
      design: {
        ...d.template.design,
        objects: [...d.template.design.objects, ...objects]
      },
      assets: [
        ...d.template.assets,
        ...clipboardAssets.filter((a) => !d.template.assets.some((b) => b.id === a.id))
      ]
    }
  }))
  useEditorStore.getState().setSelectedIds(objects.map((o) => o.id))
}

export async function copyToSystemClipboard(): Promise<void> {
  copy()
  clipboardToken = newId()
  const selected = selection()
  const image = selected.length === 1 && selected[0]?.kind === 'image' ? selected[0] : null
  const result = await window.barista.invoke('clipboard:write', {
    text: clipboardText,
    imageBase64: image ? clipboardData[image.assetId] : undefined,
    baristaToken: clipboardToken
  })
  if (!result.ok) throw new Error(result.error.message)
}

export async function pasteFromSystemClipboard(inPlace = false): Promise<void> {
  const result = await window.barista.invoke('clipboard:read')
  if (!result.ok) throw new Error(result.error.message)
  if (
    clipboard.length &&
    ((result.value.kind === 'barista' && result.value.token === clipboardToken) ||
      (result.value.kind === 'text' && result.value.text === clipboardText))
  ) {
    paste(inPlace)
    return
  }
  if (result.value.kind === 'text') {
    const object = createTextFromClipboard(result.value.text)
    useDocumentStore.getState().beginGesture()
    useDocumentStore.getState().addObjects([object])
    const font = useFontStore
      .getState()
      .catalog.families.find((family) => family.family === object.fontFamily)
    if (font) applyFontFamily(font, [object.id])
    useDocumentStore.getState().endGesture()
    useEditorStore.getState().setSelectedIds([object.id])
    return
  }
  if (result.value.kind === 'image') {
    const bytes = Uint8Array.from(atob(result.value.pngBase64), (char) => char.charCodeAt(0))
    const assetId = newId()
    const object = createImageFromClipboard(assetId)
    useDocumentStore.getState().change((document) => ({
      ...document,
      assetData: {
        ...document.assetData,
        [assetId]: result.value.kind === 'image' ? result.value.pngBase64 : ''
      },
      template: {
        ...document.template,
        design: {
          ...document.template.design,
          objects: [...document.template.design.objects, object]
        },
        assets: [
          ...document.template.assets,
          {
            id: assetId,
            fileName: `${assetId}.png`,
            mimeType: 'image/png',
            byteLength: bytes.length
          }
        ]
      }
    }))
    useEditorStore.getState().setSelectedIds([object.id])
  }
}

function createTextFromClipboard(text: string): Extract<LabelObject, { kind: 'text' }> {
  const object = createObject('text', 3, 3)
  if (object.kind !== 'text') throw new Error('Text object creation failed.')
  object.text = text.slice(0, 100_000)
  object.name = text.trim().slice(0, 40) || 'Text'
  return object
}

function createImageFromClipboard(assetId: string): Extract<LabelObject, { kind: 'image' }> {
  const object = createObject('image', 3, 3)
  if (object.kind !== 'image') throw new Error('Image object creation failed.')
  object.assetId = assetId
  object.name = 'Pasted image'
  return object
}
export function remove(): void {
  useDocumentStore.getState().removeObjects(useEditorStore.getState().selectedIds)
  useEditorStore.getState().setSelectedIds([])
}
export function nudge(x: number, y: number): void {
  const ids = useEditorStore.getState().selectedIds
  useDocumentStore.getState().change((d) => ({
    ...d,
    template: {
      ...d.template,
      design: {
        ...d.template.design,
        objects: d.template.design.objects.map((o) =>
          ids.includes(o.id) && !o.locked ? { ...o, xMm: o.xMm + x, yMm: o.yMm + y } : o
        )
      }
    }
  }))
}
export function arrange(action: string): void {
  const store = useDocumentStore.getState(),
    ids = useEditorStore.getState().selectedIds
  const selected = selection().filter((o) => !o.locked)
  if (action === 'unlock') {
    store.updateObjects(ids, { locked: false }, true)
    return
  }
  if (!selected.length) return
  if (action === 'group' || action === 'ungroup') {
    store.updateObjects(ids, { groupId: action === 'group' ? newId() : undefined })
    return
  }
  if (action === 'lock' || action === 'hide') {
    store.updateObjects(ids, action === 'lock' ? { locked: true } : { visible: false })
    return
  }
  store.change((d) => {
    let objects = [...d.template.design.objects]
    if (action.startsWith('align')) {
      const b =
        selected.length === 1
          ? { x: 0, y: 0, width: d.template.stock.widthMm, height: d.template.stock.heightMm }
          : bounds(selected)
      objects = objects.map((o) => {
        if (!ids.includes(o.id) || o.locked) return o
        const q = bounds([o])
        const dx =
          action === 'alignLeft'
            ? b.x - q.x
            : action === 'alignCenter'
              ? b.x + b.width / 2 - q.x - q.width / 2
              : action === 'alignRight'
                ? b.x + b.width - q.x - q.width
                : 0
        const dy =
          action === 'alignTop'
            ? b.y - q.y
            : action === 'alignMiddle'
              ? b.y + b.height / 2 - q.y - q.height / 2
              : action === 'alignBottom'
                ? b.y + b.height - q.y - q.height
                : 0
        return { ...o, xMm: o.xMm + dx, yMm: o.yMm + dy }
      })
    } else if (action === 'distributeHorizontal' || action === 'distributeVertical') {
      if (selected.length < 3) return d
      const horizontal = action === 'distributeHorizontal'
      const ordered = [...selected].sort((left, right) => {
        const a = bounds([left]),
          b = bounds([right])
        return horizontal ? a.x - b.x : a.y - b.y
      })
      const first = bounds([ordered[0]!]),
        last = bounds([ordered.at(-1)!])
      const occupied = ordered.reduce((sum, object) => {
        const objectBounds = bounds([object])
        return sum + (horizontal ? objectBounds.width : objectBounds.height)
      }, 0)
      const extent = horizontal ? last.x + last.width - first.x : last.y + last.height - first.y
      const gap = (extent - occupied) / (ordered.length - 1)
      let cursor = horizontal ? first.x : first.y
      const positions = new Map<string, number>()
      for (const object of ordered) {
        positions.set(object.id, cursor)
        const objectBounds = bounds([object])
        cursor += (horizontal ? objectBounds.width : objectBounds.height) + gap
      }
      objects = objects.map((object) => {
        const position = positions.get(object.id)
        if (position === undefined) return object
        const objectBounds = bounds([object])
        return horizontal
          ? { ...object, xMm: object.xMm + position - objectBounds.x }
          : { ...object, yMm: object.yMm + position - objectBounds.y }
      })
    } else if (action === 'front' || action === 'back') {
      const a = objects.filter((o) => ids.includes(o.id)),
        b = objects.filter((o) => !ids.includes(o.id))
      objects = action === 'front' ? [...b, ...a] : [...a, ...b]
    } else if (action === 'forward') {
      for (let i = objects.length - 2; i >= 0; i--)
        if (ids.includes(objects[i]!.id) && !ids.includes(objects[i + 1]!.id))
          [objects[i], objects[i + 1]] = [objects[i + 1]!, objects[i]!]
    } else if (action === 'backward') {
      for (let i = 1; i < objects.length; i++)
        if (ids.includes(objects[i]!.id) && !ids.includes(objects[i - 1]!.id))
          [objects[i], objects[i - 1]] = [objects[i - 1]!, objects[i]!]
    }
    return {
      ...d,
      template: { ...d.template, design: { ...d.template.design, objects } }
    }
  })
}

export function setAllObjects(property: 'locked' | 'visible', value: boolean): void {
  const store = useDocumentStore.getState()
  store.updateObjects(
    store.document.template.design.objects.map((object) => object.id),
    { [property]: value },
    true
  )
  if (property === 'visible' && !value) useEditorStore.getState().setSelectedIds([])
}
