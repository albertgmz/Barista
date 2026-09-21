/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import type { AvailableUpdate, UpdateState } from '@shared/updates'
import { SettingsStoreFile } from '../storage/settings'
import { sendTo } from '../ipc/typedIpc'
import type { UpdateAdapter, UpdateAdapterEvents } from './controller'
import { UpdateController } from './controller'
import { getMainWindow } from '../windows/mainWindow'

export const RELEASES_URL = 'https://github.com/albertgmz/Barista/releases'
const INITIAL_DELAY_MS = 5000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

interface UpdaterInfo {
  version: string
  releaseNotes?: string | Array<{ note?: string | null }> | null
}

function releaseNotes(info: UpdaterInfo): string | undefined {
  if (typeof info.releaseNotes === 'string') return info.releaseNotes
  if (!Array.isArray(info.releaseNotes)) return undefined
  const notes = info.releaseNotes
    .map((item) => item.note)
    .filter((note): note is string => typeof note === 'string' && note.length > 0)
  return notes.length > 0 ? notes.join('\n\n') : undefined
}

function availableUpdate(info: UpdaterInfo): AvailableUpdate {
  return { version: info.version, releaseNotes: releaseNotes(info) }
}

class ElectronUpdateAdapter implements UpdateAdapter {
  get autoDownload(): boolean {
    return autoUpdater.autoDownload
  }
  set autoDownload(value: boolean) {
    autoUpdater.autoDownload = value
  }
  get autoInstallOnAppQuit(): boolean {
    return autoUpdater.autoInstallOnAppQuit
  }
  set autoInstallOnAppQuit(value: boolean) {
    autoUpdater.autoInstallOnAppQuit = value
  }
  on<K extends keyof UpdateAdapterEvents>(event: K, listener: UpdateAdapterEvents[K]): void {
    switch (event) {
      case 'checking':
        autoUpdater.on('checking-for-update', listener as UpdateAdapterEvents['checking'])
        break
      case 'available':
        autoUpdater.on('update-available', (info) =>
          (listener as UpdateAdapterEvents['available'])(availableUpdate(info))
        )
        break
      case 'notAvailable':
        autoUpdater.on('update-not-available', listener as UpdateAdapterEvents['notAvailable'])
        break
      case 'progress':
        autoUpdater.on('download-progress', (progress) =>
          (listener as UpdateAdapterEvents['progress'])(progress.percent)
        )
        break
      case 'downloaded':
        autoUpdater.on('update-downloaded', (info) =>
          (listener as UpdateAdapterEvents['downloaded'])(availableUpdate(info))
        )
        break
      case 'error':
        autoUpdater.on('error', listener as UpdateAdapterEvents['error'])
        break
    }
  }
  checkForUpdates(): Promise<unknown> {
    return autoUpdater.checkForUpdates()
  }
  downloadUpdate(): Promise<unknown> {
    return autoUpdater.downloadUpdate()
  }
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    autoUpdater.quitAndInstall(isSilent, isForceRunAfter)
  }
}

let controller: UpdateController | null = null
let startupTimer: ReturnType<typeof setTimeout> | null = null
let intervalTimer: ReturnType<typeof setInterval> | null = null

function installMode(): 'installed' | 'portable' | 'development' {
  if (!app.isPackaged) return 'development'
  return process.env['PORTABLE_EXECUTABLE_FILE'] ? 'portable' : 'installed'
}

export function initializeUpdateService(): UpdateController {
  if (controller) return controller
  const mode = installMode()
  const store = new SettingsStoreFile()
  controller = new UpdateController({
    currentVersion: app.getVersion(),
    mode,
    releasesUrl: RELEASES_URL,
    adapter: mode === 'installed' ? new ElectronUpdateAdapter() : null,
    readPreferences: async () => (await store.read()).updates,
    publish: (state) => {
      const window = getMainWindow()
      if (window) sendTo(window, 'updates:state', state)
    }
  })
  return controller
}

export function scheduleUpdateChecks(window: BrowserWindow): void {
  const schedule = (): void => {
    if (startupTimer || intervalTimer) return
    startupTimer = setTimeout(() => {
      startupTimer = null
      void initializeUpdateService().check(false)
    }, INITIAL_DELAY_MS)
    intervalTimer = setInterval(() => {
      void initializeUpdateService().check(false)
    }, CHECK_INTERVAL_MS)
    intervalTimer.unref()
  }
  if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', schedule)
  else schedule()
}

export function stopUpdateChecks(): void {
  if (startupTimer) clearTimeout(startupTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  startupTimer = null
  intervalTimer = null
}

export function updateState(): UpdateState {
  return initializeUpdateService().state
}

export function checkForUpdates(): Promise<UpdateState> {
  return initializeUpdateService().check(true)
}

export function downloadUpdate(): Promise<UpdateState> {
  return initializeUpdateService().download()
}

export function installUpdate(): UpdateState {
  return initializeUpdateService().install()
}

export async function openReleasesPage(): Promise<void> {
  await shell.openExternal(RELEASES_URL)
}
