/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect } from 'react'
import { defaultWorkspace, restoreWorkspace } from '@shared/workspace'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useEditorStore } from '../store/editorStore'
import { useUiStore } from '../store/uiStore'

export function useWorkspace(): void {
  const restored = useWorkspaceStore((state) => state.restored)
  const dockReady = useWorkspaceStore((state) => state.dockReady)
  const keepObjectsInsideLabel = useWorkspaceStore((state) => state.layout.keepObjectsInsideLabel)
  const showSampleData = useWorkspaceStore((state) => state.layout.showSampleData)
  // The editor owns the live flag; the workspace only carries it between runs.
  useEffect(() => {
    useEditorStore.getState().setKeepObjectsInsideLabel(keepObjectsInsideLabel)
  }, [keepObjectsInsideLabel])
  useEffect(() => {
    useUiStore.getState().setShowSampleData(showSampleData)
  }, [showSampleData])
  useEffect(() => {
    let active = true
    // A broken bridge must not leave a permanently empty workspace.
    const fallback = window.setTimeout(() => {
      if (active) useWorkspaceStore.getState().restore(defaultWorkspace())
    }, 5000)
    void window.barista
      .invoke('workspace:read')
      .then((result) => {
        if (!active || useWorkspaceStore.getState().restored) return
        if (!result.ok) useWorkspaceStore.setState({ error: result.error.message })
        useWorkspaceStore
          .getState()
          .restore(result.ok ? restoreWorkspace(result.value) : defaultWorkspace())
      })
      .catch(() => {
        if (active) useWorkspaceStore.getState().restore(defaultWorkspace())
      })
      .finally(() => window.clearTimeout(fallback))
    return () => {
      active = false
      window.clearTimeout(fallback)
    }
  }, [])

  useEffect(() => {
    if (!restored || !dockReady) return
    let timer: number | undefined
    let pending = false
    const save = async (): Promise<void> => {
      window.clearTimeout(timer)
      pending = false
      await window.barista
        .invoke('workspace:write', useWorkspaceStore.getState().layout)
        .then((result) => {
          useWorkspaceStore.setState({ error: result.ok ? null : result.error.message })
        })
        .catch(() => useWorkspaceStore.setState({ error: 'Could not save the workspace.' }))
    }
    const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      if (state.layout === previous.layout) return
      pending = true
      window.clearTimeout(timer)
      timer = window.setTimeout(save, 250)
    })
    const flush = window.barista.on('workspace:flush', () => {
      void save().finally(() => window.barista.send('workspace:flushed'))
    })
    const beforeUnload = (): void => {
      if (pending) save()
    }
    window.addEventListener('beforeunload', beforeUnload)
    // Two animation frames allow restored panels and the canvas to paint.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => window.barista.send('app:ready'))
    })
    return () => {
      unsubscribe()
      flush()
      window.removeEventListener('beforeunload', beforeUnload)
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      if (pending) save()
    }
  }, [restored, dockReady])
}
