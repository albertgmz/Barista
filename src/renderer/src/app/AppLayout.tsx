/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { JSX } from 'react'
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
        <Menu openOnContext>
          <MenuTrigger disableButtonEnhancement>
            <main className="canvas-area" aria-label="Label workspace" tabIndex={0}>
              <div className="document-tab">
                {fileName} <span>Label design</span>
              </div>
              <div className="canvas-content">
                <CanvasStage />
              </div>
            </main>
          </MenuTrigger>
          <MenuPopover>
            <CommandMenuList items={CANVAS_MENU} />
          </MenuPopover>
        </Menu>
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
