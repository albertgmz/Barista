/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * The typed edges of the IPC layer.
 *
 * Domain modules register channels through {@link handle} rather than through
 * `ipcMain` directly: the channel name, its request and its response all come
 * from `IpcInvokeMap`, so a handler cannot be attached to the wrong shape or
 * return the wrong one.
 */

import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent, IpcMainEvent, WebContents } from 'electron'
import { fail, notImplemented, ok } from '@shared/ipc/contract'
import type {
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcRequest,
  IpcResponse,
  IpcResult
} from '@shared/ipc/contract'
import { NotImplementedError } from '@shared/errors'

const trustedInvokeSenders = new WeakSet<WebContents>()

/** Register the one application renderer allowed to invoke privileged main-process services. */
export function trustIpcSender(target: WebContents): void {
  trustedInvokeSenders.add(target)
}

export function isTrustedIpcEvent(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return trustedInvokeSenders.has(event.sender) && event.senderFrame === event.sender.mainFrame
}

/** Registers the single handler for an invoke channel. */
export function handle<C extends IpcInvokeChannel>(
  channel: C,
  handler: (request: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>
): void {
  ipcMain.handle(channel, (event, request: IpcRequest<C>) => {
    if (!isTrustedIpcEvent(event))
      throw new Error('Blocked IPC request from an untrusted renderer.')
    return handler(request)
  })
}

/** Pushes a main-process event to one window. */
export function sendTo<C extends IpcEventChannel>(
  target: BrowserWindow,
  channel: C,
  payload: IpcEventPayload<C>
): void {
  if (target.isDestroyed()) return
  target.webContents.send(channel, payload)
}

/**
 * Adapts a service call to the result envelope. The services behind the IPC
 * layer are still stubs that throw `NotImplementedError`; this turns that into
 * the `not-implemented` code the renderer can branch on, instead of an opaque
 * rejection that loses it.
 */
export async function fromService<T>(
  feature: string,
  run: () => Promise<T>
): Promise<IpcResult<T>> {
  try {
    return ok(await run())
  } catch (error) {
    if (error instanceof NotImplementedError) return notImplemented<T>(feature)
    return fail<T>('io-error', error instanceof Error ? error.message : String(error))
  }
}
