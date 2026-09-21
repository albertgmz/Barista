/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useState, type JSX } from 'react'
import { MenuPopover, MenuTrigger, tokens } from '@fluentui/react-components'
import { CanvasStage } from '../editor/CanvasStage'
import { ToolsPanel } from '../editor/ToolsPanel'
import { ToolOptionsBar } from '../editor/ToolOptionsBar'
import { PanelDock } from '../panels/PanelDock'
import { PanelResizer } from '../components/PanelResizer'
import { CommandMenuList, RegistryMenu as Menu } from '../commands/CommandMenu'
import { CANVAS_MENU } from '../commands/menuModel'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useDocumentStore } from '../store'
import { StatusBar } from './StatusBar'
import { TitleBar } from './TitleBar'
import './workspace.css'

export function AppLayout(): JSX.Element {
  const { layout, restored, resetVersion, error, setPanelWidth } = useWorkspaceStore()
  const fileName = useDocumentStore((state) => state.fileName)
  const toolsWidth = layout.tools.columns === 1 ? 48 : 86
  const panelsVisible = Object.values(layout.panels).some(Boolean)
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    // Fabric stops the bubbling contextmenu event on its upper canvas. Capture it
    // at the document boundary so an object menu is as reliable as selection.
    const openObjectMenu = (event: MouseEvent): void => {
      if (!(event.target instanceof Element) || !event.target.closest('.canvas-container')) return
      event.preventDefault()
      setContextPosition({ x: event.clientX, y: event.clientY })
    }
    document.addEventListener('contextmenu', openObjectMenu, true)
    return () => document.removeEventListener('contextmenu', openObjectMenu, true)
  }, [])
  return (
    <div
      className="app-layout"
      style={
        {
          '--chrome-bg': tokens.colorNeutralBackground3,
          '--panel-bg': tokens.colorNeutralBackground1,
          '--chrome-border': tokens.colorNeutralStroke2,
          '--chrome-text': tokens.colorNeutralForeground2,
          '--accent': tokens.colorBrandBackground,
          '--accent-soft': tokens.colorBrandBackground2
        } as React.CSSProperties
      }
    >
      <TitleBar />
      {layout.optionsBarVisible && <ToolOptionsBar />}
      <div
        className="workspace"
        style={{
          paddingLeft: layout.tools.visible && layout.tools.placement === 'left' ? toolsWidth : 0,
          paddingRight: layout.tools.visible && layout.tools.placement === 'right' ? toolsWidth : 0
        }}
      >
        <main className="canvas-area" aria-label="Label workspace" tabIndex={0}>
          <div className="document-tab">
            {fileName} <span>Label design</span>
          </div>
          <div className="canvas-content">
            <CanvasStage />
          </div>
        </main>
        {contextPosition ? (
          <Menu open onOpenChange={(_, data) => !data.open && setContextPosition(null)}>
            <MenuTrigger disableButtonEnhancement>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                className="canvas-context-anchor"
                style={{ left: contextPosition.x, top: contextPosition.y }}
              />
            </MenuTrigger>
            <MenuPopover>
              <CommandMenuList items={CANVAS_MENU} />
            </MenuPopover>
          </Menu>
        ) : null}
        {panelsVisible && <PanelResizer width={layout.panelWidth} onChange={setPanelWidth} />}
        <div className="panel-dock" style={{ width: panelsVisible ? layout.panelWidth : 0 }}>
          {restored && <PanelDock key={resetVersion} />}
        </div>
        {layout.tools.visible && <ToolsPanel />}
      </div>
      {error && (
        <div className="workspace-error" role="status">
          {error}
        </div>
      )}
      <StatusBar />
    </div>
  )
}
