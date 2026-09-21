/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useMemo } from 'react'
import type { JSX, ReactNode } from 'react'
import { Toast, ToastBody, ToastTitle, useToastController } from '@fluentui/react-components'
import { CommandRegistry } from './registry'
import { CommandsContext, type NotifyOptions } from './context'
import { registerDocumentCommands } from './features/documentCommands'
import { registerWorkspaceCommands } from './features/workspaceCommands'
import { registerToolCommands } from './features/toolCommands'
import { dispatchShortcut } from './shortcuts'
import { useUiStore } from '../store'

export function CommandProvider({ children }: { children: ReactNode }): JSX.Element {
  const { dispatchToast } = useToastController()
  const value = useMemo(() => {
    const registry = new CommandRegistry()
    const notify = ({ title, body, intent = 'info', action }: NotifyOptions): void =>
      dispatchToast(
        <Toast>
          <ToastTitle action={action}>{title}</ToastTitle>
          <ToastBody>{body}</ToastBody>
        </Toast>,
        { intent }
      )
    registerDocumentCommands(registry)
    registerWorkspaceCommands(registry)
    registerToolCommands(registry)
    return {
      registry,
      notify,
      execute: (id: string): void => {
        void registry.execute(id).catch((error) =>
          notify({
            title: 'Command failed',
            body: error instanceof Error ? error.message : String(error),
            action: (
              <button
                type="button"
                onClick={() => useUiStore.getState().setDiagnosticReportOpen(true)}
              >
                Create report…
              </button>
            )
          })
        )
      }
    }
  }, [dispatchToast])
  useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      const ui = useUiStore.getState()
      const popup = document.querySelector('[role="menu"], [role="dialog"]')
      dispatchShortcut(
        event,
        value.registry,
        value.execute,
        ui.isAboutDialogOpen || ui.isPrintDialogOpen || !!popup
      )
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [value])
  return <CommandsContext.Provider value={value}>{children}</CommandsContext.Provider>
}
