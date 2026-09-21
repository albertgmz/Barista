/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { ReactElement } from 'react'

export interface KeyBinding {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export interface Command {
  id: string
  label: string
  icon?: ReactElement
  shortcut?: { display: string; binding: KeyBinding }
  isEnabled: () => boolean
  isChecked?: () => boolean
  run: () => void | Promise<void>
}

export class CommandRegistry {
  private readonly commands = new Map<string, Command>()

  register(command: Command): void {
    if (this.commands.has(command.id)) throw new Error(`Duplicate command: ${command.id}`)
    if (
      command.shortcut &&
      this.all().some(
        (existing) =>
          existing.shortcut &&
          bindingKey(existing.shortcut.binding) === bindingKey(command.shortcut!.binding)
      )
    )
      throw new Error(`Duplicate shortcut: ${command.shortcut.display}`)
    this.commands.set(command.id, command)
  }

  get(id: string): Command {
    const command = this.commands.get(id)
    if (!command) throw new Error(`Unknown command: ${id}`)
    return command
  }

  all(): Command[] {
    return [...this.commands.values()]
  }

  async execute(id: string): Promise<boolean> {
    const command = this.get(id)
    if (!command.isEnabled()) return false
    await command.run()
    return true
  }
}

function bindingKey(binding: KeyBinding): string {
  return `${!!binding.ctrl}:${!!binding.shift}:${!!binding.alt}:${binding.key.toLowerCase()}`
}
