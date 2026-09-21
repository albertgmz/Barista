/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { createContext, useContext } from 'react'
import type { ReactElement } from 'react'
import type { ToastIntent } from '@fluentui/react-components'
import type { CommandRegistry } from './registry'

export interface NotifyOptions {
  title: string
  body: string
  /** Toast intent; `info` unless the caller says otherwise. */
  intent?: ToastIntent
  /** Control rendered beside the title, such as a link to the object at fault. */
  action?: ReactElement
}

export interface CommandsContextValue {
  registry: CommandRegistry
  execute: (id: string) => void
  /** The application's only toast dispatcher. */
  notify: (options: NotifyOptions) => void
}
export const CommandsContext = createContext<CommandsContextValue | null>(null)
export function useCommands(): CommandsContextValue {
  const value = useContext(CommandsContext)
  if (!value) throw new Error('Commands provider is missing')
  return value
}
