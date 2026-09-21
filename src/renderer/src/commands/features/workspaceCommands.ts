/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { CommandRegistry } from '../registry'
import { MAX_ZOOM, MIN_ZOOM, useEditorStore, useUiStore } from '../../store'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { PANEL_IDS } from '@shared/workspace'
import { useDocumentStore } from '../../store/documentStore'

export function registerWorkspaceCommands(registry: CommandRegistry): void {
  const add = (
    id: string,
    label: string,
    run: () => void | Promise<void>,
    isChecked?: () => boolean,
    key?: string,
    display?: string,
    isEnabled = () => true
  ): void => {
    registry.register({
      id,
      label,
      run,
      isEnabled,
      isChecked,
      shortcut: key ? { display: display ?? '', binding: { key, ctrl: true } } : undefined
    })
  }
  add(
    'view.zoomIn',
    'Zoom In',
    () => useEditorStore.getState().zoomIn(),
    undefined,
    '=',
    'Ctrl+=',
    () => useEditorStore.getState().zoom < MAX_ZOOM
  )
  add(
    'view.zoomOut',
    'Zoom Out',
    () => useEditorStore.getState().zoomOut(),
    undefined,
    '-',
    'Ctrl+−',
    () => useEditorStore.getState().zoom > MIN_ZOOM
  )
  add(
    'view.zoomFit',
    'Fit to Window',
    () => useEditorStore.getState().requestZoomToFit(),
    undefined,
    '0',
    'Ctrl+0'
  )
  add(
    'view.actualSize',
    'Actual Size',
    () =>
      useEditorStore.getState().requestActualSize(useUiStore.getState().preferences.screenDpi / 96),
    undefined,
    '1',
    'Ctrl+1'
  )
  add(
    'view.zoomSelection',
    'Zoom to Selection',
    () => useEditorStore.getState().requestZoomToSelection(),
    undefined,
    '2',
    'Ctrl+2',
    () => useEditorStore.getState().selectedIds.length > 0
  )
  add(
    'view.grid',
    'Show Grid',
    () => useUiStore.getState().toggleGrid(),
    () => useUiStore.getState().showGrid
  )
  add(
    'view.rulers',
    'Show Rulers',
    () => useUiStore.getState().toggleRulers(),
    () => useUiStore.getState().showRulers
  )
  add(
    'view.snap',
    'Snap to Grid',
    () => useUiStore.getState().toggleSnap(),
    () => useUiStore.getState().snapToGrid
  )
  add(
    'view.sampleData',
    'Show Sample Data',
    () => {
      useUiStore.getState().toggleSampleData()
      useWorkspaceStore.getState().setShowSampleData(useUiStore.getState().showSampleData)
    },
    () => useUiStore.getState().showSampleData
  )
  add(
    'view.lockGuides',
    'Lock Guides',
    () =>
      useDocumentStore.getState().change((document) => {
        const locked = document.template.design.guides.every((guide) => guide.locked)
        return {
          ...document,
          template: {
            ...document.template,
            design: {
              ...document.template.design,
              guides: document.template.design.guides.map((guide) => ({
                ...guide,
                locked: !locked
              }))
            }
          }
        }
      }),
    () => {
      const guides = useDocumentStore.getState().document.template.design.guides
      return guides.length > 0 && guides.every((guide) => guide.locked)
    },
    undefined,
    undefined,
    () => useDocumentStore.getState().document.template.design.guides.length > 0
  )
  add(
    'view.clearGuides',
    'Clear Guides',
    () =>
      useDocumentStore.getState().change((document) => ({
        ...document,
        template: {
          ...document.template,
          design: {
            ...document.template.design,
            guides: document.template.design.guides.filter((guide) => guide.locked)
          }
        }
      })),
    undefined,
    undefined,
    undefined,
    () => useDocumentStore.getState().document.template.design.guides.some((guide) => !guide.locked)
  )
  for (const source of ['system', 'light', 'dark'] as const) {
    add(
      `theme.${source}`,
      source.charAt(0).toUpperCase() + source.slice(1),
      async () => {
        const info = await window.barista.invoke('theme:set', source)
        const saved = await window.barista.invoke('settings:write', { theme: source })
        if (saved.ok) useUiStore.getState().applyPreferences(saved.value)
        useUiStore.getState().setThemeSource(info.source)
        useUiStore.getState().setIsDark(info.shouldUseDarkColors)
      },
      () => useUiStore.getState().themeSource === source
    )
  }
  add(
    'window.tools',
    'Tools',
    () => {
      const { layout, setTools } = useWorkspaceStore.getState()
      setTools({ visible: !layout.tools.visible })
    },
    () => useWorkspaceStore.getState().layout.tools.visible
  )
  add(
    'window.options',
    'Options Bar',
    () => useWorkspaceStore.getState().toggleOptions(),
    () => useWorkspaceStore.getState().layout.optionsBarVisible
  )
  for (const id of PANEL_IDS) {
    add(
      `window.${id}`,
      id.charAt(0).toUpperCase() + id.slice(1),
      () => useWorkspaceStore.getState().togglePanel(id),
      () => useWorkspaceStore.getState().layout.panels[id]
    )
  }
  add('workspace.reset', 'Reset Workspace', () => useWorkspaceStore.getState().reset())
  add('file.dataSources', 'Excel Data Sources…', () =>
    useUiStore.getState().setDataSourceOpen(true)
  )
  add('window.minimize', 'Minimize', () => window.barista.invoke('window:minimize'))
  add('window.printHistory', 'Print History', () => useUiStore.getState().setPrintHistoryOpen(true))
  add('window.maximize', 'Maximize / Restore', () => window.barista.invoke('window:toggleMaximize'))
  add(
    'window.close',
    'Close Window',
    () => window.barista.invoke('window:close'),
    undefined,
    'w',
    'Ctrl+W'
  )
  add(
    'tools.columns',
    'Two-column Tools',
    () => {
      const { layout, setTools } = useWorkspaceStore.getState()
      setTools({ columns: layout.tools.columns === 1 ? 2 : 1 })
    },
    () => useWorkspaceStore.getState().layout.tools.columns === 2
  )
  for (const placement of ['left', 'right', 'floating'] as const) {
    add(
      `tools.${placement}`,
      placement === 'floating' ? 'Float Tools' : `Dock ${placement === 'left' ? 'Left' : 'Right'}`,
      () => useWorkspaceStore.getState().setTools({ placement }),
      () => useWorkspaceStore.getState().layout.tools.placement === placement
    )
  }
}
