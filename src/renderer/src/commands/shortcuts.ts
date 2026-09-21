/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { CommandRegistry } from './registry'

export function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return (
    !!element &&
    (element.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) ||
      !!element.closest?.('[contenteditable="true"], [role="textbox"], [role="combobox"]'))
  )
}

/** Text fields retain Chromium's native editing keys; commands never intercept them. */
export function dispatchShortcut(
  event: KeyboardEvent,
  registry: CommandRegistry,
  execute: (id: string) => void,
  modalOpen = false
): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    modalOpen ||
    isTextEntry(event.target) ||
    event.getModifierState?.('AltGraph')
  )
    return false
  const command = registry.all().find(({ shortcut }) => {
    const binding = shortcut?.binding
    return (
      binding &&
      binding.key.toLowerCase() === event.key.toLowerCase() &&
      !!binding.ctrl === (event.ctrlKey || event.metaKey) &&
      !!binding.shift === event.shiftKey &&
      !!binding.alt === event.altKey
    )
  })
  if (!command) return false
  event.preventDefault()
  if (command.isEnabled()) execute(command.id)
  return true
}
