/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { createDocument, createObject, DEFAULT_STOCK, newId } from '@shared/template/document'
import type { IpcResult } from '@shared/ipc/contract'
import type { LabelDocument } from '@shared/template/types'
import { useDocumentStore } from '../store/documentStore'
import { useEditorStore } from '../store/editorStore'
import { useUiStore } from '../store/uiStore'
import { resetEditorBreadcrumbs, sendBreadcrumb } from '../diagnostics/breadcrumbs'

/** Breadcrumbs describe a label by its size, never by its name or its path. */
function documentShape(document: LabelDocument): { objects: number; variables: number } {
  return {
    objects: document.template.design.objects.length,
    variables: document.template.variables.length
  }
}
export function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
export async function saveDocument(saveAs = false): Promise<boolean> {
  const s = useDocumentStore.getState()
  if (s.fileReadOnly) {
    window.alert('This file was created by a newer version of Barista and is open read-only.')
    return false
  }
  s.endGesture()
  const current = useDocumentStore.getState().document
  const document = {
    ...current,
    template: {
      ...current.template,
      metadata: { ...current.template.metadata, modifiedAt: new Date().toISOString() }
    }
  }
  const path =
    saveAs || !s.filePath
      ? unwrap(
          await window.barista.invoke('template:showSaveDialog', {
            suggestedName:
              s.fileName === 'Untitled'
                ? `${document.template.metadata.title.replace(/[<>:"/\\|?*]+/g, '_')}.bar`
                : s.fileName
          })
        )
      : s.filePath
  if (!path) return false
  unwrap(await window.barista.invoke('template:write', { path, document }))
  s.setFilePath(path)
  s.completeSave(document)
  sendBreadcrumb({ event: 'editor.document-saved', ...documentShape(document) })
  unwrap(await window.barista.invoke('template:recoveryDiscard'))
  return true
}
export async function confirmChanges(): Promise<boolean> {
  if (!useDocumentStore.getState().isDirty) return true
  const answer = unwrap(await window.barista.invoke('document:confirm'))
  if (answer === 'discard') {
    unwrap(await window.barista.invoke('template:recoveryDiscard'))
    return true
  }
  return answer === 'save' && (await saveDocument())
}
export async function openDocument(path?: string, discardCurrent = false): Promise<void> {
  if (!discardCurrent && !(await confirmChanges())) return
  const target = path ?? unwrap(await window.barista.invoke('template:showOpenDialog'))
  if (!target) return
  const opened = unwrap(await window.barista.invoke('template:read', { path: target }))
  useEditorStore.getState().setSelectedIds([])
  useDocumentStore.getState().loadDocument(opened.document, target, {
    readOnly: opened.readOnly
  })
  resetEditorBreadcrumbs()
  sendBreadcrumb({ event: 'editor.document-opened', ...documentShape(opened.document) })
  if (opened.warning) window.alert(opened.warning)
  unwrap(await window.barista.invoke('template:recoveryDiscard'))
  useEditorStore.getState().requestZoomToFit()
}
export async function newDocument(): Promise<void> {
  if (await confirmChanges()) {
    unwrap(await window.barista.invoke('template:recoveryDiscard'))
    useUiStore.getState().setNewLabelOpen(true)
  }
}
export async function closeDocument(): Promise<void> {
  if (!(await confirmChanges())) return
  unwrap(await window.barista.invoke('template:recoveryDiscard'))
  const stock = { ...DEFAULT_STOCK, ...useUiStore.getState().preferences.defaultLabel }
  resetEditorBreadcrumbs()
  useEditorStore.getState().setSelectedIds([])
  useDocumentStore.getState().loadDocument(createDocument(stock), null)
}
export async function importImage(x = 3, y = 3, file?: File): Promise<void> {
  try {
    let imported
    if (file) {
      if (
        !['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type) ||
        file.size > 20_000_000
      )
        throw new Error('Choose a PNG, JPG or SVG smaller than 20 MB.')
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1]!)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const id = newId()
      imported = {
        asset: {
          id,
          fileName: `${id}.${file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'svg'}`,
          mimeType: file.type,
          byteLength: file.size
        },
        data
      }
    } else imported = unwrap(await window.barista.invoke('asset:import'))
    if (!imported) return
    const { asset, data } = imported
    const image = new Image()
    image.src = `data:${asset.mimeType};base64,${data}`
    await image.decode()
    const o = createObject('image', x, y)
    if (o.kind !== 'image') return
    o.assetId = asset.id
    o.heightMm = (o.widthMm * image.naturalHeight) / image.naturalWidth
    useDocumentStore.getState().change((d) => ({
      ...d,
      template: {
        ...d.template,
        assets: [...d.template.assets, asset],
        design: {
          ...d.template.design,
          objects: [...d.template.design.objects, o]
        }
      },
      assetData: { ...d.assetData, [asset.id]: data }
    }))
    useEditorStore.getState().setActiveTool('select')
    useEditorStore.getState().setSelectedIds([o.id])
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e))
  }
}
