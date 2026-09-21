/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainEvent } from 'electron'
import type { IpcSendMap } from '@shared/ipc/contract'
import { sendTo } from '../ipc/typedIpc'
import { flushWorkspaceWrites } from '../storage/workspace'

/** Drain the renderer debounce before destroying its bridge, including File > Exit. */
export function watchWorkspaceClose(win: BrowserWindow): void {
  let approved = false
  let pending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const channel: keyof IpcSendMap = 'workspace:flushed'
  const finish = (): void => {
    clearTimeout(timer)
    if (approved) return
    approved = true
    void flushWorkspaceWrites().finally(() => {
      if (!win.isDestroyed()) win.close()
    })
  }
  const flushed = (event: IpcMainEvent): void => {
    if (pending && event.sender === win.webContents && event.senderFrame === event.sender.mainFrame)
      finish()
  }
  ipcMain.on(channel, flushed)
  win.on('close', (event) => {
    if (approved || event.defaultPrevented) return
    event.preventDefault()
    if (pending) return
    pending = true
    sendTo(win, 'workspace:flush', undefined)
    // A crashed renderer must never prevent closing the application.
    timer = setTimeout(finish, 1000)
  })
  win.on('closed', () => {
    clearTimeout(timer)
    ipcMain.removeListener(channel, flushed)
  })
}
