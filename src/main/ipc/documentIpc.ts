/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app, ClipboardItem, clipboard, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { newId } from '@shared/template/document'
import { getMainWindow } from '../windows/mainWindow'
import { fontManager, listInstalledFonts } from '../fonts'
import { fromService, handle, isTrustedIpcEvent } from './typedIpc'
let pendingPath: string | null = process.argv.find((v) => /\.bar$/i.test(v)) ?? null
let closeApproved = false
const closeWatched = new WeakSet<Electron.BrowserWindow>()
export function approveDocumentClose(): void {
  closeApproved = true
}
export function queueDocumentOpen(args: string[]): void {
  const path = args.find((v) => /\.bar$/i.test(v))
  if (!path) return
  pendingPath = path
  const win = getMainWindow()
  if (win) win.webContents.send('document:open', path)
}
export function watchDocumentClose(): void {
  const win = getMainWindow()
  if (!win || closeWatched.has(win)) return
  closeWatched.add(win)
  win.prependListener('close', (e) => {
    if (closeApproved || win.webContents.isCrashed()) return
    e.preventDefault()
    win.webContents.send('document:closeRequested')
  })
}
export function registerDocumentIpc(): void {
  handle('document:pending', () => {
    const path = pendingPath
    pendingPath = null
    return path
  })
  handle('document:close', () => {
    approveDocumentClose()
    getMainWindow()?.close()
  })
  handle('document:confirm', () =>
    fromService('Confirming changes', async () => {
      const win = getMainWindow()
      const options = {
        type: 'question' as const,
        buttons: ['Save', 'Discard', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: 'Save changes to this label?'
      }
      const result = await (win
        ? dialog.showMessageBox(win, options)
        : dialog.showMessageBox(options))
      return (['save', 'discard', 'cancel'] as const)[result.response] ?? 'cancel'
    })
  )
  handle('asset:import', () =>
    fromService('Importing image', async () => {
      const win = getMainWindow(),
        options = {
          title: 'Import image',
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }],
          properties: ['openFile' as const]
        }
      const result = await (win
        ? dialog.showOpenDialog(win, options)
        : dialog.showOpenDialog(options))
      const path = result.filePaths[0]
      if (result.canceled || !path) return null
      const bytes = await readFile(path)
      if (bytes.length > 20_000_000) throw new Error('Images must be smaller than 20 MB.')
      const extension = extname(path).toLowerCase(),
        id = newId(),
        mimeType =
          extension === '.svg' ? 'image/svg+xml' : extension === '.png' ? 'image/png' : 'image/jpeg'
      return {
        asset: { id, fileName: `${id}${extension}`, mimeType, byteLength: bytes.length },
        data: bytes.toString('base64')
      }
    })
  )
  handle('fonts:list', () => fromService('Listing fonts', () => listInstalledFonts()))
  handle('fonts:import', () =>
    fromService('Importing a font', async () => {
      const win = getMainWindow()
      const options = {
        title: 'Import font',
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff2'] }],
        properties: ['openFile' as const]
      }
      const result = await (win
        ? dialog.showOpenDialog(win, options)
        : dialog.showOpenDialog(options))
      const path = result.filePaths[0]
      return result.canceled || !path ? null : fontManager.importFile(path)
    })
  )
  handle('fonts:remove', (request) =>
    fromService('Removing a custom font', () => fontManager.remove(request.id))
  )
  handle('clipboard:read', () =>
    fromService('Reading the clipboard', async () => {
      const items = await clipboard.read()
      const baristaItem = items.find((item) => item.types.includes('application/x-barista-objects'))
      if (baristaItem) {
        const payload = await baristaItem.getType('application/x-barista-objects')
        if (payload instanceof Blob)
          return { kind: 'barista' as const, token: await payload.text() }
      }
      const imageItem = items.find((item) => item.types.includes('image/png'))
      if (imageItem) {
        const image = await imageItem.getType('image/png')
        if (image instanceof Blob)
          return {
            kind: 'image' as const,
            pngBase64: Buffer.from(await image.arrayBuffer()).toString('base64')
          }
      }
      const text = await clipboard.readText()
      return text ? { kind: 'text' as const, text } : { kind: 'empty' as const }
    })
  )
  handle('clipboard:write', (request) =>
    fromService('Writing the clipboard', async () => {
      const content: Record<string, Blob | string> = { 'text/plain': request.text }
      if (request.imageBase64)
        content['image/png'] = new Blob([Buffer.from(request.imageBase64, 'base64')], {
          type: 'image/png'
        })
      if (request.baristaToken)
        content['application/x-barista-objects'] = new Blob([request.baristaToken], {
          type: 'application/x-barista-objects'
        })
      await clipboard.write([new ClipboardItem(content)])
    })
  )
  app.on('second-instance', (_event, args) => queueDocumentOpen(args))
  ipcMain.on('app:ready', (event) => {
    if (isTrustedIpcEvent(event)) watchDocumentClose()
  })
}
