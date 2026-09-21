/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { DockviewApi } from 'dockview-react'
import type { PanelId } from '@shared/workspace'
import { useWorkspaceStore } from '../store/workspaceStore'

let dock: DockviewApi | null = null

/** `PanelDock` hosts the only dockview instance and registers its api here. */
export function setDockApi(api: DockviewApi | null): void {
  dock = api
}

/** Bring a panel to the front. A panel that is switched back on opens active already. */
export function revealPanel(id: PanelId): void {
  const { layout, togglePanel } = useWorkspaceStore.getState()
  if (!layout.panels[id]) togglePanel(id)
  else dock?.getPanel(id)?.api.setActive()
}
