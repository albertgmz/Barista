/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { create } from 'zustand'
import { defaultWorkspace } from '@shared/workspace'
import type { PanelId, WorkspaceLayout } from '@shared/workspace'

interface WorkspaceState {
  layout: WorkspaceLayout
  restored: boolean
  dockReady: boolean
  resetVersion: number
  error: string | null
  restore: (layout: WorkspaceLayout) => void
  setDockview: (dockview: Record<string, unknown>) => void
  setTools: (tools: Partial<WorkspaceLayout['tools']>) => void
  togglePanel: (id: PanelId) => void
  setPanels: (panels: WorkspaceLayout['panels']) => void
  setPanelWidth: (panelWidth: number) => void
  setKeepObjectsInsideLabel: (keepObjectsInsideLabel: boolean) => void
  setShowSampleData: (showSampleData: boolean) => void
  toggleOptions: () => void
  reset: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  layout: defaultWorkspace(),
  restored: false,
  dockReady: false,
  resetVersion: 0,
  error: null,
  restore: (layout) => set({ layout, restored: true }),
  setDockview: (dockview) => set((state) => ({ layout: { ...state.layout, dockview } })),
  setTools: (tools) =>
    set((state) => ({ layout: { ...state.layout, tools: { ...state.layout.tools, ...tools } } })),
  togglePanel: (id) =>
    set((state) => ({
      layout: {
        ...state.layout,
        panels: { ...state.layout.panels, [id]: !state.layout.panels[id] }
      }
    })),
  setPanels: (panels) => set((state) => ({ layout: { ...state.layout, panels } })),
  setPanelWidth: (panelWidth) => set((state) => ({ layout: { ...state.layout, panelWidth } })),
  setKeepObjectsInsideLabel: (keepObjectsInsideLabel) =>
    set((state) => ({ layout: { ...state.layout, keepObjectsInsideLabel } })),
  setShowSampleData: (showSampleData) =>
    set((state) => ({ layout: { ...state.layout, showSampleData } })),
  toggleOptions: () =>
    set((state) => ({
      layout: { ...state.layout, optionsBarVisible: !state.layout.optionsBarVisible }
    })),
  reset: () =>
    set((state) => ({
      layout: defaultWorkspace(),
      resetVersion: state.resetVersion + 1,
      dockReady: false
    }))
}))
