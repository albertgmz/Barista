/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { SplashApi, SplashStatus, IpcEventChannel, IpcSendMap } from '@shared/ipc/contract'

const statusChannel: IpcEventChannel = 'splash:status'
const readyChannel: keyof IpcSendMap = 'splash:ready'
const api: SplashApi = {
  ready: () => ipcRenderer.send(readyChannel),
  onStatus: (listener) => {
    const forward = (_event: IpcRendererEvent, status: SplashStatus): void => listener(status)
    ipcRenderer.on(statusChannel, forward)
    return () => {
      ipcRenderer.removeListener(statusChannel, forward)
    }
  }
}
contextBridge.exposeInMainWorld('splash', api)
