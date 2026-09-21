/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app, Menu, Tray } from 'electron'
import { join } from 'node:path'
import { integrationServer } from './printApi'
import { focusStartupWindow, startWorkspace } from '@main/windows/startup'
import { getMainWindow } from '@main/windows/mainWindow'
import { approveDocumentClose } from '@main/ipc/documentIpc'

let tray: Tray | null = null

export function syncIntegrationTray(): void {
  if (!integrationServer.isRunning) {
    tray?.destroy()
    tray = null
    return
  }
  if (tray) return
  tray = new Tray(join(__dirname, '../renderer/branding/icon.ico'))
  tray.setToolTip(`Barista Integration · port ${integrationServer.actualPort}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Barista',
        click: () => (getMainWindow() ? focusStartupWindow() : startWorkspace())
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          approveDocumentClose()
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', () => (getMainWindow() ? focusStartupWindow() : startWorkspace()))
}
