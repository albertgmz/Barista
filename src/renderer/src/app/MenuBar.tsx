/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Button, MenuPopover, MenuTrigger } from '@fluentui/react-components'
import { MENUS } from '../commands/menuModel'
import { CommandMenuList, RegistryMenu as Menu } from '../commands/CommandMenu'
import { useUiStore } from '../store'

/** Fluent owns popup navigation; this controller owns navigation across menus. */
export function MenuBar(): JSX.Element {
  const [open, setOpen] = useState<number | null>(null)
  const [focused, setFocused] = useState(0)
  const [mnemonics, setMnemonics] = useState(false)
  const buttons = useRef<(HTMLElement | null)[]>([])
  const previousFocus = useRef<HTMLElement | null>(null)
  const altOnly = useRef(false)
  useEffect(() => {
    const focusMenu = (index: number, expand: boolean): void => {
      previousFocus.current = document.activeElement as HTMLElement | null
      setFocused(index)
      setMnemonics(true)
      buttons.current[index]?.focus()
      if (expand) setOpen(index)
    }
    const down = (event: KeyboardEvent): void => {
      const ui = useUiStore.getState()
      if (
        ui.isAboutDialogOpen ||
        ui.isPrintDialogOpen ||
        event.isComposing ||
        event.getModifierState('AltGraph')
      )
        return
      if (event.key === 'Alt' && !event.ctrlKey && !event.shiftKey) {
        altOnly.current = true
        event.preventDefault()
        return
      }
      altOnly.current = false
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const index = MENUS.findIndex((menu) => menu.mnemonic === event.key.toLowerCase())
        if (index >= 0) {
          event.preventDefault()
          focusMenu(index, true)
        }
      }
      if (
        event.key === 'Escape' &&
        open === null &&
        buttons.current.includes(document.activeElement as HTMLButtonElement)
      ) {
        setMnemonics(false)
        previousFocus.current?.focus()
        event.preventDefault()
      }
    }
    const up = (event: KeyboardEvent): void => {
      if (event.key === 'Alt' && altOnly.current) {
        event.preventDefault()
        altOnly.current = false
        if (buttons.current.includes(document.activeElement as HTMLButtonElement)) {
          setOpen(null)
          setMnemonics(false)
          previousFocus.current?.focus()
        } else focusMenu(0, false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [open])
  const move = (direction: number): void => {
    const index = (focused + direction + MENUS.length) % MENUS.length
    setFocused(index)
    buttons.current[index]?.focus()
    if (open !== null) setOpen(index)
  }
  return (
    <nav
      className={`menu-bar ${mnemonics ? 'show-mnemonics' : ''}`}
      role="menubar"
      aria-label="Application menu"
      onKeyDown={(event) => {
        // Popups are portaled, but React events bubble through this menubar.
        const target = event.target as HTMLElement
        if (target.closest('[role="menu"]')) return
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault()
          move(event.key === 'ArrowRight' ? 1 : -1)
        }
      }}
    >
      {MENUS.map((menu, index) => (
        <Menu
          key={menu.label}
          open={open === index}
          onOpenChange={(_, data) => {
            setOpen(data.open ? index : null)
            if (data.open) setFocused(index)
          }}
        >
          <MenuTrigger disableButtonEnhancement>
            <Button
              ref={(element) => {
                buttons.current[index] = element
              }}
              appearance="subtle"
              size="small"
              role="menuitem"
              tabIndex={focused === index ? 0 : -1}
              aria-keyshortcuts={`Alt+${menu.mnemonic}`}
              onFocus={() => setFocused(index)}
              onMouseEnter={() => {
                if (open !== null) {
                  setFocused(index)
                  setOpen(index)
                }
              }}
            >
              <span>
                <span className="mnemonic">{menu.label[0]}</span>
                {menu.label.slice(1)}
              </span>
            </Button>
          </MenuTrigger>
          <MenuPopover
            onKeyDown={(event) => {
              const target = event.target as HTMLElement
              const rootMenu = event.currentTarget.querySelector('[role="menu"]')
              if (target.closest('[role="menu"]') !== rootMenu) return
              if (
                event.key === 'ArrowLeft' ||
                (event.key === 'ArrowRight' &&
                  target.getAttribute('aria-haspopup') !== 'menu' &&
                  target.getAttribute('aria-haspopup') !== 'true')
              ) {
                event.preventDefault()
                event.stopPropagation()
                move(event.key === 'ArrowRight' ? 1 : -1)
              }
            }}
          >
            <CommandMenuList items={menu.items} />
          </MenuPopover>
        </Menu>
      ))}
    </nav>
  )
}
