/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Button, MenuPopover, MenuTrigger } from '@fluentui/react-components'
import {
  ChevronDoubleLeft16Regular,
  ChevronDoubleRight16Regular,
  ReOrderDotsHorizontal16Regular
} from '@fluentui/react-icons'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useCommands } from '../commands/context'
import { CommandMenuList, RegistryMenu as Menu } from '../commands/CommandMenu'
import { TOOLS_MENU } from '../commands/menuModel'
import { TOOL_GROUPS } from '../commands/features/toolCommands'
import { clampToolPosition } from '@shared/workspace'
import type { ToolPlacement } from '@shared/workspace'
import { ToolButton } from './ToolButton'

export function ToolsPanel(): JSX.Element {
  const tools = useWorkspaceStore((state) => state.layout.tools)
  const { registry, execute } = useCommands()
  const panel = useRef<HTMLElement>(null)
  const drag = useRef<{
    dx: number
    dy: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const [preview, setPreview] = useState<'left' | 'right' | null>(null)
  useLayoutEffect(() => {
    const element = panel.current
    const host = element?.parentElement
    if (!element || !host) return
    const clamp = (): void => {
      const current = useWorkspaceStore.getState().layout.tools
      const position = clampToolPosition(
        current.x,
        current.y,
        host.clientWidth,
        host.clientHeight,
        element.offsetWidth,
        element.offsetHeight
      )
      if (position.x !== current.x || position.y !== current.y)
        useWorkspaceStore.getState().setTools(position)
    }
    clamp()
    const observer = new ResizeObserver(clamp)
    observer.observe(host)
    observer.observe(element)
    return () => observer.disconnect()
  }, [tools.columns, tools.placement])
  const columns = registry.get('tools.columns')
  const finish = (cancel = false): void => {
    if (drag.current?.moved && !cancel) {
      useWorkspaceStore.getState().setTools({ placement: preview ?? 'floating' })
    }
    drag.current = null
    setPreview(null)
  }
  return (
    <>
      {preview && <div className={`dock-preview ${preview}`} aria-hidden />}
      <aside
        ref={panel}
        className={`tools-panel ${tools.placement} columns-${tools.columns}`}
        style={tools.placement === 'floating' ? { left: tools.x, top: tools.y } : undefined}
        aria-label="Tools panel"
      >
        <div className="tools-header">
          <Menu openOnContext>
            <MenuTrigger disableButtonEnhancement>
              <button
                className="tools-grip"
                aria-label="Move Tools panel"
                title="Drag to move · Right-click for docking"
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  const bounds = panel.current!.getBoundingClientRect()
                  drag.current = {
                    dx: event.clientX - bounds.left,
                    dy: event.clientY - bounds.top,
                    startX: event.clientX,
                    startY: event.clientY,
                    moved: false
                  }
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  const moving = drag.current
                  if (!moving) return
                  if (
                    !moving.moved &&
                    Math.hypot(event.clientX - moving.startX, event.clientY - moving.startY) < 5
                  )
                    return
                  moving.moved = true
                  const host = panel.current!.parentElement!.getBoundingClientRect()
                  const x = event.clientX - host.left
                  const edge = x < 48 ? 'left' : x > host.width - 48 ? 'right' : null
                  setPreview(edge)
                  const position = clampToolPosition(
                    x - moving.dx,
                    event.clientY - host.top - moving.dy,
                    host.width,
                    host.height,
                    panel.current!.offsetWidth,
                    panel.current!.offsetHeight
                  )
                  useWorkspaceStore.getState().setTools({ placement: 'floating', ...position })
                }}
                onPointerUp={() => finish()}
                onPointerCancel={() => finish(true)}
                onLostPointerCapture={() => finish(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') finish(true)
                  const directions: Record<string, [number, number]> = {
                    ArrowLeft: [-10, 0],
                    ArrowRight: [10, 0],
                    ArrowUp: [0, -10],
                    ArrowDown: [0, 10]
                  }
                  const direction = directions[event.key]
                  if (!direction) return
                  event.preventDefault()
                  if (event.ctrlKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                    execute(`tools.${event.key === 'ArrowLeft' ? 'left' : 'right'}`)
                  } else
                    useWorkspaceStore.getState().setTools({
                      placement: 'floating' as ToolPlacement,
                      x: Math.max(0, tools.x + direction[0]),
                      y: Math.max(0, tools.y + direction[1])
                    })
                }}
              >
                <ReOrderDotsHorizontal16Regular aria-hidden />
              </button>
            </MenuTrigger>
            <MenuPopover>
              <CommandMenuList items={TOOLS_MENU} />
            </MenuPopover>
          </Menu>
          <Button
            size="small"
            appearance="subtle"
            className="tools-columns"
            aria-label={columns.label}
            aria-pressed={columns.isChecked?.()}
            onClick={() => execute(columns.id)}
            icon={
              tools.columns === 1 ? <ChevronDoubleRight16Regular /> : <ChevronDoubleLeft16Regular />
            }
          />
        </div>
        <div className="tools-grid" role="toolbar" aria-label="Drawing tools">
          {TOOL_GROUPS.map((variants) => (
            <ToolButton key={variants[0]} variants={variants} />
          ))}
        </div>
        <div className="tools-swatches" aria-hidden>
          <span />
          <span />
        </div>
      </aside>
    </>
  )
}
