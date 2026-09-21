/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { FunctionComponent, JSX } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { DockviewReact, themeDark, themeLight } from 'dockview-react'
import type { DockviewReadyEvent, IDockviewPanelProps } from 'dockview-react'
import { useWorkspaceStore } from '../store/workspaceStore'
import { PANEL_IDS, defaultWorkspace } from '@shared/workspace'
import { clampPanelWidth } from '@shared/workspace'
import type { DockviewApi, SerializedDockview } from 'dockview-react'
import { useCommands } from '../commands/context'
import { setDockApi } from './dockFocus'
import { useUiStore } from '@renderer/store'
import { AssetsPanel } from './AssetsPanel'
import { LayersPanel } from './LayersPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { VariablesPanel } from './VariablesPanel'
import { PreflightPanel } from './PreflightPanel'

const components: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  properties: PropertiesPanel,
  layers: LayersPanel,
  variables: VariablesPanel,
  assets: AssetsPanel,
  preflight: PreflightPanel
}

const useStyles = makeStyles({
  root: {
    height: '100%',
    /*
     * Dockview paints from its own CSS variables, which it declares on an
     * inner element it owns. A declaration there beats anything inherited from
     * this wrapper, so the Fluent values have to be set on that same element.
     */
    '& .dockview-theme-light, & .dockview-theme-dark': {
      '--dv-group-view-background-color': tokens.colorNeutralBackground1,
      '--dv-tabs-and-actions-container-background-color': tokens.colorNeutralBackground3,
      '--dv-activegroup-visiblepanel-tab-background-color': tokens.colorNeutralBackground1,
      '--dv-inactivegroup-visiblepanel-tab-background-color': tokens.colorNeutralBackground3,
      '--dv-activegroup-visiblepanel-tab-color': tokens.colorNeutralForeground1,
      '--dv-inactivegroup-visiblepanel-tab-color': tokens.colorNeutralForeground3,
      '--dv-activegroup-hiddenpanel-tab-color': tokens.colorNeutralForeground3,
      '--dv-inactivegroup-hiddenpanel-tab-color': tokens.colorNeutralForeground4,
      '--dv-separator-border': tokens.colorNeutralStroke2,
      '--dv-sash-color': tokens.colorNeutralStroke2,
      '--dv-active-sash-color': tokens.colorNeutralStroke1,
      '--dv-tabs-and-actions-container-height': '32px',
      '--dv-tab-font-size': tokens.fontSizeBase200
    }
  }
})

export function PanelDock(): JSX.Element {
  const styles = useStyles()
  const isDark = useUiStore((state) => state.isDark)
  const panelWidth = useWorkspaceStore((state) => state.layout.panelWidth)
  const setPanelWidth = useWorkspaceStore((state) => state.setPanelWidth)
  const root = useRef<HTMLDivElement>(null)

  const { registry } = useCommands()
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  useLayoutEffect(() => {
    const host = root.current
    if (!host) return
    const fitTabs = (): void => {
      const tabGroups = [...host.querySelectorAll<HTMLElement>('.dv-tabs-and-actions-container')]
      const required = Math.max(
        0,
        ...tabGroups.map(
          (group) =>
            [...group.querySelectorAll<HTMLElement>('.dv-tab')].reduce(
              (total, tab) => total + tab.getBoundingClientRect().width,
              0
            ) + 16
        )
      )
      if (required <= panelWidth) return
      const workspaceWidth = host.closest('.workspace')?.clientWidth
      setPanelWidth(clampPanelWidth(required, workspaceWidth))
    }
    fitTabs()
    const observer = new ResizeObserver(fitTabs)
    observer.observe(host)
    return () => observer.disconnect()
  }, [panelWidth, setPanelWidth])
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api: DockviewApi = event.api
      setDockApi(api)
      let syncing = true
      let initializing = true
      const add = (id: string): void => {
        const reference = api.getPanel('layers') ?? api.panels[0]
        api.addPanel({
          id,
          component: id,
          title: registry.get(`window.${id}`).label,
          inactive: initializing && id !== 'properties' && id !== 'layers',
          position: reference
            ? {
                referencePanel: reference.id,
                direction: id === 'layers' && reference.id === 'properties' ? 'below' : 'within'
              }
            : undefined
        })
      }
      const generation = useWorkspaceStore.getState().resetVersion
      const initial = useWorkspaceStore.getState().layout
      if (initial.dockview) {
        try {
          api.fromJSON(initial.dockview as unknown as SerializedDockview)
        } catch (error) {
          console.warn('Saved dock layout could not be restored; using defaults.', error)
          api.clear()
          useWorkspaceStore.setState({ layout: defaultWorkspace() })
        }
      }
      const sync = (): void => {
        syncing = true
        const visible = useWorkspaceStore.getState().layout.panels
        for (const id of PANEL_IDS) {
          const panel = api.getPanel(id)
          if (visible[id] && !panel) add(id)
          else if (!visible[id] && panel) api.removePanel(panel)
        }
        syncing = false
      }
      sync()
      initializing = false
      const snapshot = (): void => {
        if (syncing || generation !== useWorkspaceStore.getState().resetVersion) return
        const panels = Object.fromEntries(
          PANEL_IDS.map((id) => [id, !!api.getPanel(id)])
        ) as typeof initial.panels
        const dockview = api.toJSON() as unknown as Record<string, unknown>
        const store = useWorkspaceStore.getState()
        useWorkspaceStore.setState({
          layout: { ...store.layout, panels, dockview },
          dockReady: true
        })
      }
      snapshot()
      const changed = api.onDidLayoutChange(snapshot)
      const removed = api.onDidRemovePanel(() => {
        if (!syncing) snapshot()
      })
      const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
        if (state.resetVersion !== previous.resetVersion) return
        if (
          PANEL_IDS.some((id) => state.layout.panels[id] !== previous.layout.panels[id]) &&
          !syncing
        ) {
          sync()
          snapshot()
        }
      })
      cleanup.current = () => {
        changed.dispose()
        removed.dispose()
        unsubscribe()
        setDockApi(null)
      }
    },
    [registry]
  )

  return (
    <div ref={root} className={styles.root}>
      <DockviewReact
        components={components}
        theme={isDark ? themeDark : themeLight}
        onReady={onReady}
        disableFloatingGroups
      />
    </div>
  )
}
