/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'node:path'
import { appendFile, mkdir } from 'node:fs/promises'
import { userDataPaths } from '../storage/paths'
import { sendTo } from '../ipc/typedIpc'
import type { IpcSendMap, SplashStatus } from '@shared/ipc/contract'
import { createMainWindow, devRendererUrl, getMainWindow, revealMainWindow } from './mainWindow'
import { SettingsStoreFile } from '../storage/settings'
import { TemplateStore } from '../storage/templates'
import { readWorkspace } from '../storage/workspace'
import { fontManager } from '../fonts'
const SAFETY_TIMEOUT_MS = 15000
let splash: BrowserWindow | null = null
let startupComplete = false

function minimumDuration(): number {
  const value = Number(process.env['BARISTA_SPLASH_MIN_MS'] ?? 1500)
  return Number.isFinite(value) ? Math.min(10000, Math.max(0, value)) : 1500
}

export function focusStartupWindow(): void {
  const win = startupComplete ? getMainWindow() : splash
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function startWorkspace(): void {
  startupComplete = false
  const duration = minimumDuration()
  const start = Date.now()
  let rendererReady = false
  let servicesReady = false
  let shown = false
  let status: SplashStatus = {
    name: 'Barista',
    version: app.getVersion(),
    codename: 'Espresso',
    status: 'Initializing application…',
    progress: 0.08
  }
  const win = new BrowserWindow({
    width: 820,
    height: 520,
    center: true,
    frame: false,
    show: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    roundedCorners: true,
    hasShadow: true,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'Barista — Starting',
    icon: join(__dirname, '../renderer/branding/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/splash.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  splash = win
  // The splash follows OS colours independently of a future saved app theme.
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  const url = devRendererUrl()
  if (url) void win.loadURL(`${url}/splash.html?theme=${theme}`)
  else void win.loadFile(join(__dirname, '../renderer/splash.html'), { query: { theme } })

  const publish = (): void => sendTo(win, 'splash:status', status)
  const fade = (): void => {
    let opacity = 1
    const timer = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(timer)
        return
      }
      opacity -= 0.2
      if (opacity <= 0) {
        clearInterval(timer)
        win.close()
      } else win.setOpacity(opacity)
    }, 30)
  }
  const reveal = (force = false): void => {
    if (shown || (!force && (!rendererReady || !servicesReady || Date.now() - start < duration)))
      return
    console.info(
      `Showing workspace after ${Date.now() - start} ms${force ? ' (safety timeout)' : ''}`
    )
    shown = true
    startupComplete = true
    status = { ...status, status: 'Ready', progress: 1 }
    publish()
    clearTimeout(watchdog)
    clearTimeout(minimum)
    revealMainWindow()
    fade()
  }
  const readyChannel: keyof IpcSendMap = 'app:ready'
  const splashChannel: keyof IpcSendMap = 'splash:ready'
  const ready = (event: Electron.IpcMainEvent): void => {
    if (shown) return
    if (
      event.sender !== getMainWindow()?.webContents ||
      event.senderFrame !== event.sender.mainFrame
    )
      return
    console.info(`Workspace renderer ready after ${Date.now() - start} ms`)
    rendererReady = true
    reveal()
  }
  const splashReady = (event: Electron.IpcMainEvent): void => {
    if (event.sender === win.webContents && event.senderFrame === event.sender.mainFrame) publish()
  }
  ipcMain.on(readyChannel, ready)
  ipcMain.on(splashChannel, splashReady)
  const minimum = setTimeout(() => reveal(), duration)
  const watchdog = setTimeout(() => {
    const message = `${new Date().toISOString()} Main renderer readiness timed out after ${SAFETY_TIMEOUT_MS} ms.\n`
    console.error(message.trim())
    const paths = userDataPaths()
    void mkdir(paths.logsDir, { recursive: true })
      .then(() => appendFile(join(paths.logsDir, 'startup.log'), message))
      .catch(console.error)
    reveal(true)
  }, SAFETY_TIMEOUT_MS)
  win.on('closed', () => {
    splash = null
    ipcMain.removeListener(splashChannel, splashReady)
  })
  const main = createMainWindow()
  const step = async (
    label: string,
    progress: number,
    work: () => Promise<unknown>
  ): Promise<void> => {
    status = { ...status, status: label, progress }
    publish()
    try {
      await work()
    } catch (error) {
      console.warn(`${label} failed during startup preflight.`, error)
    }
  }
  void (async () => {
    await step('Loading preferences…', 0.18, () => new SettingsStoreFile().read())
    await step('Loading Barista fonts…', 0.36, () => fontManager.catalog())
    await step('Detecting printers…', 0.54, () => main.webContents.getPrintersAsync())
    await step('Checking autosave recovery…', 0.72, () => new TemplateStore().readRecovery())
    await step('Restoring workspace…', 0.9, () => readWorkspace())
    servicesReady = true
    status = { ...status, status: 'Preparing first frame…', progress: 0.96 }
    publish()
    reveal()
  })()
  main.on('closed', () => {
    clearTimeout(watchdog)
    clearTimeout(minimum)
    ipcMain.removeListener(readyChannel, ready)
    if (!win.isDestroyed()) win.close()
  })
}
