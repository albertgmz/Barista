/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import {
  saveDocument,
  openDocument,
  newDocument,
  closeDocument,
  unwrap
} from '../../editor/fileActions'
import {
  arrange,
  copyToSystemClipboard,
  pasteFromSystemClipboard,
  remove,
  setAllObjects
} from '../../editor/objectActions'
import type { CommandRegistry, KeyBinding } from '../registry'
import { useDocumentStore, useEditorStore, useUiStore } from '../../store'
import { makeVariableFromSelection } from '../../editor/variableActions'
import { sendBreadcrumb } from '../../diagnostics/breadcrumbs'
import { revealPanel } from '../../panels/dockFocus'

/**
 * A failed export is recorded before it is reported, so the log says which
 * format was refused even when the operator dismisses the notice. The result
 * envelope's code is all that travels: its message can name the file.
 */
async function exportDocument(format: 'pdf' | 'png'): Promise<void> {
  const result = await window.barista.invoke('document:export', {
    document: useDocumentStore.getState().document,
    format
  })
  if (!result.ok) sendBreadcrumb({ event: 'editor.export-failed', format, code: result.error.code })
  unwrap(result)
}

export function registerDocumentCommands(registry: CommandRegistry): void {
  const add = (
    id: string,
    label: string,
    binding?: KeyBinding,
    display?: string,
    run?: () => void | Promise<void>,
    enabled = () => true
  ): void => {
    registry.register({
      id,
      label,
      isEnabled: enabled,
      shortcut: binding ? { binding, display: display ?? '' } : undefined,
      run: run ?? (() => undefined)
    })
  }
  const selectedObjects = () => {
    const ids = useEditorStore.getState().selectedIds
    return useDocumentStore
      .getState()
      .document.template.design.objects.filter((object) => ids.includes(object.id))
  }
  const selected = (): boolean => selectedObjects().length > 0
  const editable = (): boolean => !useDocumentStore.getState().fileReadOnly
  const selectedEditable = (): boolean =>
    editable() && selectedObjects().some((object) => !object.locked)
  const ctrl = (key: string, shift = false): KeyBinding => ({ key, ctrl: true, shift })
  add('file.new', 'New', ctrl('n'), 'Ctrl+N', newDocument)
  add('file.open', 'Open...', ctrl('o'), 'Ctrl+O', () => openDocument())
  add('file.clearRecent', 'Clear Recent', undefined, undefined, async () => {
    unwrap(await window.barista.invoke('template:clearRecent'))
  })
  add(
    'file.save',
    'Save',
    ctrl('s'),
    'Ctrl+S',
    async () => {
      await saveDocument()
    },
    () => useDocumentStore.getState().isDirty && editable()
  )
  add(
    'file.saveAs',
    'Save As...',
    ctrl('s', true),
    'Ctrl+Shift+S',
    async () => {
      await saveDocument(true)
    },
    editable
  )
  add(
    'file.revert',
    'Revert',
    undefined,
    undefined,
    async () => {
      const path = useDocumentStore.getState().filePath
      if (path && window.confirm('Discard unsaved changes and reopen the saved label?'))
        await openDocument(path, true)
    },
    () => !!useDocumentStore.getState().filePath && useDocumentStore.getState().isDirty
  )
  add('file.close', 'Close Label', undefined, undefined, closeDocument)
  add('file.exportPdf', 'PDF...', undefined, undefined, () => exportDocument('pdf'))
  add('file.exportPng', 'PNG...', undefined, undefined, () => exportDocument('png'))
  add('file.labelSetup', 'Label Setup...', undefined, undefined, () =>
    useUiStore.getState().setLabelSetupOpen(true)
  )
  add('file.print', 'Print…', ctrl('p'), 'Ctrl+P', () =>
    useUiStore.getState().setPrintDialogOpen(true)
  )
  add('file.exit', 'Exit', undefined, undefined, () => window.barista.invoke('app:exit'))
  add(
    'edit.undo',
    'Undo',
    ctrl('z'),
    'Ctrl+Z',
    () => useDocumentStore.getState().undo(),
    () => useDocumentStore.getState().past.length > 0 && editable()
  )
  add(
    'edit.redo',
    'Redo',
    ctrl('y'),
    'Ctrl+Y',
    () => useDocumentStore.getState().redo(),
    () => useDocumentStore.getState().future.length > 0 && editable()
  )
  add(
    'edit.cut',
    'Cut',
    ctrl('x'),
    'Ctrl+X',
    async () => {
      await copyToSystemClipboard()
      remove()
    },
    selectedEditable
  )
  add('edit.copy', 'Copy', ctrl('c'), 'Ctrl+C', copyToSystemClipboard, selected)
  add('edit.paste', 'Paste', ctrl('v'), 'Ctrl+V', () => pasteFromSystemClipboard(), editable)
  add(
    'edit.pasteInPlace',
    'Paste in Place',
    ctrl('v', true),
    'Ctrl+Shift+V',
    () => pasteFromSystemClipboard(true),
    editable
  )
  add(
    'edit.duplicate',
    'Duplicate',
    ctrl('d'),
    'Ctrl+D',
    async () => {
      await copyToSystemClipboard()
      await pasteFromSystemClipboard()
    },
    selectedEditable
  )
  add('edit.delete', 'Delete', { key: 'Delete' }, 'Del', remove, selectedEditable)
  add(
    'edit.selectAll',
    'Select All',
    ctrl('a'),
    'Ctrl+A',
    () =>
      useEditorStore.getState().setSelectedIds(
        useDocumentStore
          .getState()
          .document.template.design.objects.filter((o) => o.visible && !o.locked)
          .map((o) => o.id)
      ),
    () =>
      useDocumentStore
        .getState()
        .document.template.design.objects.some((object) => object.visible && !object.locked)
  )
  add(
    'edit.deselect',
    'Deselect',
    ctrl('d', true),
    'Ctrl+Shift+D',
    () => useEditorStore.getState().setSelectedIds([]),
    selected
  )
  add('edit.preferences', 'Preferences...', ctrl(','), 'Ctrl+,', () =>
    useUiStore.getState().setPreferencesOpen(true)
  )
  add(
    'object.bindVariable',
    'Bind to variable...',
    undefined,
    undefined,
    () => useUiStore.getState().setVariableBindingOpen(true),
    () =>
      editable() &&
      useDocumentStore.getState().document.template.variables.length > 0 &&
      selectedObjects().some(
        (object) =>
          !object.locked &&
          (object.kind === 'text' || object.kind === 'barcode' || object.kind === 'qrcode')
      )
  )
  add(
    'object.dataSource',
    'Data source',
    undefined,
    undefined,
    () => {
      revealPanel('properties')
      requestAnimationFrame(() => {
        document.getElementById('object-data-source')?.focus({ preventScroll: false })
      })
    },
    () =>
      editable() &&
      selectedObjects().some(
        (object) =>
          !object.locked &&
          (object.kind === 'text' || object.kind === 'barcode' || object.kind === 'qrcode')
      )
  )
  add(
    'object.makeVariableSelection',
    'Make variable from selection',
    undefined,
    undefined,
    () => {
      const selection = useEditorStore.getState().textSelection
      if (!selection) return
      const document = useDocumentStore.getState().document
      const object = document.template.design.objects.find((item) => item.id === selection.objectId)
      if (!object || object.kind !== 'text') return
      const selectedText = object.text.slice(selection.start, selection.end)
      const name = window.prompt('Variable name', selectedText)?.trim()
      if (!name) return
      useDocumentStore
        .getState()
        .change((current) =>
          makeVariableFromSelection(
            current,
            selection.objectId,
            selection.start,
            selection.end,
            name
          )
        )
    },
    () => {
      const selection = useEditorStore.getState().textSelection
      return (
        !!selection &&
        editable() &&
        selectedObjects().some((object) => object.id === selection.objectId && !object.locked)
      )
    }
  )
  for (const [id, label] of [
    ['front', 'Bring to Front'],
    ['forward', 'Bring Forward'],
    ['backward', 'Send Backward'],
    ['back', 'Send to Back'],
    ['alignLeft', 'Align Left'],
    ['alignCenter', 'Align Horizontal Centers'],
    ['alignRight', 'Align Right'],
    ['alignTop', 'Align Top'],
    ['alignMiddle', 'Align Vertical Centers'],
    ['alignBottom', 'Align Bottom'],
    ['distributeHorizontal', 'Distribute Horizontally'],
    ['distributeVertical', 'Distribute Vertically'],
    ['group', 'Group'],
    ['ungroup', 'Ungroup'],
    ['lock', 'Lock'],
    ['hide', 'Hide']
  ] as const) {
    add(
      `object.${id}`,
      label,
      undefined,
      undefined,
      () => arrange(id),
      () => {
        const objects = selectedObjects()
        if (!editable()) return false
        if (id === 'group') return objects.filter((object) => !object.locked).length >= 2
        if (id === 'ungroup') return objects.some((object) => !object.locked && object.groupId)
        if (id === 'lock') return objects.some((object) => !object.locked)
        if (id === 'hide') return objects.some((object) => !object.locked && object.visible)
        if (id.startsWith('distribute'))
          return objects.filter((object) => !object.locked).length >= 3
        return objects.some((object) => !object.locked)
      }
    )
  }
  add(
    'object.unlock',
    'Unlock',
    undefined,
    undefined,
    () => arrange('unlock'),
    () => editable() && selectedObjects().some((object) => object.locked)
  )
  add(
    'object.lockAll',
    'Lock All',
    undefined,
    undefined,
    () => setAllObjects('locked', true),
    () =>
      editable() &&
      useDocumentStore.getState().document.template.design.objects.some((object) => !object.locked)
  )
  add(
    'object.unlockAll',
    'Unlock All',
    undefined,
    undefined,
    () => setAllObjects('locked', false),
    () =>
      editable() &&
      useDocumentStore.getState().document.template.design.objects.some((object) => object.locked)
  )
  add(
    'object.hideAll',
    'Hide All',
    undefined,
    undefined,
    () => setAllObjects('visible', false),
    () =>
      editable() &&
      useDocumentStore.getState().document.template.design.objects.some((object) => object.visible)
  )
  add(
    'object.showAll',
    'Show All',
    undefined,
    undefined,
    () => setAllObjects('visible', true),
    () =>
      editable() &&
      useDocumentStore.getState().document.template.design.objects.some((object) => !object.visible)
  )
  add('help.about', 'About', undefined, undefined, () =>
    useUiStore.getState().setAboutDialogOpen(true)
  )
  add('help.viewLogs', 'View Logs', undefined, undefined, () =>
    useUiStore.getState().setLogViewerOpen(true)
  )
  add('help.createDiagnosticReport', 'Create Diagnostic Report…', undefined, undefined, () =>
    useUiStore.getState().setDiagnosticReportOpen(true)
  )
}
