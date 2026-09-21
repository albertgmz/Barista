/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app, BrowserWindow, Menu, nativeTheme, session } from 'electron'
import type { Input, WebContents } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIpcHandlers } from './ipc'
import { broadcastThemeChange } from './ipc/themeIpc'
import { startWorkspace, focusStartupWindow } from './windows/startup'
import { flushWorkspaceWrites } from './storage/workspace'
import { devRendererUrl, getMainWindow, refreshTitleBarOverlay } from './windows/mainWindow'
import { closeDataStore, initializeDataStore } from './data'
import { integrationServer } from './server/printApi'
import { applyIntegrationConfiguration } from './ipc/integrationIpc'
import { initializeUpdateService, scheduleUpdateChecks, stopUpdateChecks } from './updates/service'
import { configureCrashDumpPath, diagnosticLog, initializeDiagnostics } from './diagnostics'
import {
  captureDetectedCrash,
  completePendingCrashReport,
  isCrashReason,
  markMainProcessCrash,
  rendererGoneContext
} from './diagnostics/crash'

/** Identifies the app to the Windows shell: taskbar grouping, pinning, notifications. */
const APP_USER_MODEL_ID = 'com.barista.labeldesigner'
const rendererHangTimers = new Map<number, ReturnType<typeof setTimeout>>()
configureCrashDumpPath()

process.on('uncaughtExceptionMonitor', (error, origin) => {
  markMainProcessCrash(error, origin)
  diagnosticLog.error('process.uncaught-exception', { error, origin })
})
process.on('unhandledRejection', (reason) => {
  diagnosticLog.error('process.unhandled-rejection', { reason })
})

// A second instance would fight the first over the counter database and the
// window state file, so the first one wins and the second hands over its focus.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  bootstrap()
}

function bootstrap(): void {
  app.setAppUserModelId(APP_USER_MODEL_ID)

  app.on('second-instance', focusStartupWindow)

  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents)
  })

  app.on('child-process-gone', (_event, details) => {
    if (isCrashReason(details.reason)) void captureDetectedCrash('process.child-gone', details)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      void flushWorkspaceWrites().finally(() => {
        if (!integrationServer.isRunning) app.quit()
      })
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) startWorkspace()
  })

  nativeTheme.on('updated', () => {
    refreshTitleBarOverlay()
    broadcastThemeChange()
  })

  void app.whenReady().then(async () => {
    await initializeDiagnostics()
    // Nothing in this app needs the camera, the microphone or geolocation.
    // Both handlers are needed: Chromium asks the request handler for a
    // prompt, but answers synchronous checks such as `permissions.query`
    // through the check handler, which defaults to allowing some of them.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler(() => false)

    await initializeDataStore()
    await completePendingCrashReport()
    initializeUpdateService()
    registerIpcHandlers()
    await applyIntegrationConfiguration().catch((error) =>
      console.error('Integration server startup failed.', error)
    )
    Menu.setApplicationMenu(null)
    startWorkspace()
    const window = getMainWindow()
    if (window) scheduleUpdateChecks(window)
  })

  app.on('will-quit', () => {
    diagnosticLog.info('app.stop')
    stopUpdateChecks()
    void closeDataStore()
    void diagnosticLog.flush()
  })
}

function hardenWebContents(contents: WebContents): void {
  // The app has no use for popups, and window.open is the classic way out of a
  // renderer into an uncontrolled one.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))

  contents.on('render-process-gone', (_event, details) => {
    const timer = rendererHangTimers.get(contents.id)
    if (timer) clearTimeout(timer)
    rendererHangTimers.delete(contents.id)
    if (isCrashReason(details.reason))
      void captureDetectedCrash('renderer.gone', rendererGoneContext(details))
  })

  contents.on('unresponsive', () => {
    const detail = {
      id: contents.id,
      url: contents.getURL()
    }
    diagnosticLog.warn('renderer.unresponsive', detail)
    if (!rendererHangTimers.has(contents.id))
      rendererHangTimers.set(
        contents.id,
        setTimeout(() => {
          rendererHangTimers.delete(contents.id)
          void captureDetectedCrash('renderer.hung', detail)
        }, 5_000)
      )
  })

  contents.on('responsive', () => {
    const timer = rendererHangTimers.get(contents.id)
    if (timer) clearTimeout(timer)
    rendererHangTimers.delete(contents.id)
    diagnosticLog.info('renderer.responsive', { id: contents.id })
  })

  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })

  if (app.isPackaged) {
    contents.on('before-input-event', (event, input) => {
      if (isDeveloperShortcut(input)) event.preventDefault()
    })
  }
}

/**
 * The renderer is served from the dev server in development and from the
 * packaged renderer folder otherwise. Anything else, including any other local
 * file, is an attempt to navigate the app window away from the app.
 */
function isAppUrl(target: string): boolean {
  const rendererUrl = devRendererUrl()
  try {
    const parsed = new URL(target)
    if (rendererUrl !== undefined) return parsed.origin === new URL(rendererUrl).origin
    return parsed.href.startsWith(pathToFileURL(join(__dirname, '../renderer/')).href)
  } catch {
    return false
  }
}

/** Reload and devtools keys, which have no place in a locked-down shop floor build. */
function isDeveloperShortcut(input: Input): boolean {
  if (input.type !== 'keyDown') return false
  const key = input.key.toUpperCase()
  if (key === 'F5' || key === 'F12') return true
  // AltGr arrives as Ctrl+Alt on Windows layouts, and must still reach the page.
  if (input.alt) return false
  // Covers Ctrl+R and Ctrl+Shift+R alike.
  if (input.control && key === 'R') return true
  return input.control && input.shift && key === 'I'
}
