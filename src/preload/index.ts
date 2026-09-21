/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * The preload bridge.
 *
 * This is the whole surface the renderer gets. The two allowlists below are the
 * security boundary: a compromised renderer can only reach the channels the
 * contract declares, never arbitrary `ipcRenderer` traffic.
 *
 * The script runs sandboxed, so it may only require `electron`. No Node
 * built-ins, no top-level await.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC_EVENT_CHANNELS, IPC_INVOKE_CHANNELS, IPC_SEND_CHANNELS } from '@shared/ipc/contract'
import type {
  BaristaApi,
  InvokeArgs,
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcResponse
} from '@shared/ipc/contract'

const invokeChannels: ReadonlySet<string> = new Set(IPC_INVOKE_CHANNELS)
const eventChannels: ReadonlySet<string> = new Set(IPC_EVENT_CHANNELS)

const api: BaristaApi = {
  send(channel) {
    if (!IPC_SEND_CHANNELS.includes(channel) || channel === 'splash:ready')
      throw new Error('Blocked IPC send')
    ipcRenderer.send(channel)
  },
  invoke<C extends IpcInvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<IpcResponse<C>> {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`Blocked IPC invoke on unknown channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<C>>
  },

  on<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventPayload<C>) => void
  ): () => void {
    if (!eventChannels.has(channel)) {
      throw new Error(`Blocked IPC subscription on unknown channel: ${channel}`)
    }
    // The event carries `sender`, a live handle to the window. Only the payload
    // crosses into the renderer.
    const forward = (_event: IpcRendererEvent, payload: IpcEventPayload<C>): void => {
      listener(payload)
    }
    ipcRenderer.on(channel, forward)
    return () => {
      ipcRenderer.removeListener(channel, forward)
    }
  }
}

contextBridge.exposeInMainWorld('barista', api)
