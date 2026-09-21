/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect } from 'react'
import { confirmChanges, openDocument } from './fileActions'
import { useDocumentStore } from '../store/documentStore'
import { useEditorStore } from '../store/editorStore'
import { useUiStore } from '../store/uiStore'
export function useDocumentLifecycle(): void {
  useEffect(() => {
    let closing = false,
      opening = Promise.resolve()
    const report = (error: unknown): void =>
      window.alert(error instanceof Error ? error.message : String(error))
    const open = (path: string): void => {
      opening = opening.then(() => openDocument(path)).catch(report)
    }
    const offOpen = window.barista.on('document:open', open)
    const offClose = window.barista.on('document:closeRequested', () => {
      if (closing) return
      closing = true
      void confirmChanges()
        .then((ok) => {
          if (ok) return window.barista.invoke('document:close')
        })
        .catch(report)
        .finally(() => {
          closing = false
        })
    })
    const restore = async (): Promise<void> => {
      const recoveryResult = await window.barista.invoke('template:recoveryRead')
      if (!recoveryResult.ok) throw new Error(recoveryResult.error.message)
      const recovery = recoveryResult.value
      if (recovery) {
        if (
          window.confirm(
            `Recover the unsaved label from ${new Date(recovery.savedAt).toLocaleString()}?`
          )
        ) {
          useDocumentStore
            .getState()
            .loadDocument(recovery.document, recovery.originalPath, { recovered: true })
          useEditorStore.getState().requestZoomToFit()
          return
        }
        const discarded = await window.barista.invoke('template:recoveryDiscard')
        if (!discarded.ok) throw new Error(discarded.error.message)
      }
      const path = await window.barista.invoke('document:pending')
      if (path) open(path)
    }
    void restore().catch(report)
    let lastAutosave = Date.now()
    const autosave = window.setInterval(() => {
      const state = useDocumentStore.getState()
      if (!state.isDirty || state.fileReadOnly) return
      const interval = useUiStore.getState().preferences.autosaveMinutes * 60 * 1000
      if (Date.now() - lastAutosave < interval) return
      lastAutosave = Date.now()
      void window.barista
        .invoke('template:recoveryWrite', {
          document: state.document,
          originalPath: state.filePath
        })
        .then((result) => {
          if (!result.ok) report(new Error(result.error.message))
        })
    }, 30 * 1000)
    return () => {
      window.clearInterval(autosave)
      offOpen()
      offClose()
    }
  }, [])
}
