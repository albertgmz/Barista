/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Button, MenuPopover, MenuTrigger, Tooltip } from '@fluentui/react-components'
import { useCommands } from '../commands/context'
import { CommandMenuList, RegistryMenu as Menu } from '../commands/CommandMenu'
import { useEditorStore } from '../store'
import type { ToolId } from '../store'

export function ToolButton({ variants }: { variants: readonly ToolId[] }): JSX.Element {
  const { registry, execute } = useCommands()
  const active = useEditorStore((state) => state.activeTool)
  const [last, setLast] = useState(variants[0]!)
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const held = useRef(false)
  const selected = variants.includes(active)
  const tool = selected ? active : last
  const command = registry.get(`tool.${tool}`)
  const grouped = variants.length > 1
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state) => {
      if (variants.includes(state.activeTool)) setLast(state.activeTool)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(timer.current)
    }
  }, [variants])
  return (
    <Menu
      open={open}
      onOpenChange={(_, data) => {
        // A normal click selects the tool; only an explicit flyout gesture opens it.
        if (data.type === 'menuTriggerClick' && held.current) return
        if (!data.open) setOpen(false)
      }}
      positioning="after-top"
    >
      <MenuTrigger disableButtonEnhancement>
        <Tooltip
          content={`${command.label} (${command.shortcut?.display})${grouped ? ' · Hold or right-click for more tools' : ''}`}
          relationship="description"
          positioning="after"
        >
          <Button
            className="tool-button"
            appearance={selected ? 'primary' : 'subtle'}
            icon={command.icon}
            aria-label={command.label}
            aria-pressed={selected}
            aria-haspopup={grouped ? 'menu' : undefined}
            onPointerDown={(event) => {
              held.current = false
              if (event.button === 0 && grouped)
                timer.current = window.setTimeout(() => {
                  held.current = true
                  setOpen(true)
                }, 450)
            }}
            onPointerUp={() => window.clearTimeout(timer.current)}
            onPointerLeave={() => window.clearTimeout(timer.current)}
            onPointerCancel={() => window.clearTimeout(timer.current)}
            onContextMenu={(event) => {
              if (grouped) {
                event.preventDefault()
                setOpen(true)
              }
            }}
            onKeyDown={(event) => {
              if (
                grouped &&
                (event.key === 'ArrowRight' ||
                  event.key === 'ArrowDown' ||
                  (event.key === 'F10' && event.shiftKey))
              ) {
                event.preventDefault()
                setOpen(true)
              }
            }}
            onClick={(event) => {
              if (held.current) {
                event.preventDefault()
                return
              }
              setLast(tool)
              execute(command.id)
            }}
          >
            {grouped && <span className="tool-triangle" aria-hidden />}
          </Button>
        </Tooltip>
      </MenuTrigger>
      <MenuPopover>
        <CommandMenuList items={variants.map((id) => `tool.${id}`)} />
      </MenuPopover>
    </Menu>
  )
}
