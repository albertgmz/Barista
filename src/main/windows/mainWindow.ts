/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { disposePrintWindow } from '../printing/renderWindow'
import { app, BrowserWindow, nativeTheme } from 'electron'
import type { BrowserWindowConstructorOptions, TitleBarOverlayOptions } from 'electron'
import { release } from 'node:os'
import { join } from 'node:path'
import { watchWorkspaceClose } from './workspaceClose'
import { loadWindowState, watchWindowState } from './windowState'
import { trustIpcSender } from '../ipc/typedIpc'

const MIN_WIDTH = 900
const MIN_HEIGHT = 600

/** Matches the CSS height the renderer reserves for its custom title bar. */
const TITLE_BAR_HEIGHT = 40

/** Transparent caption backgrounds expose the real Fluent title bar and modal scrim. */
const OVERLAY_COLORS = {
  dark: { color: '#00000000', symbolColor: '#ffffff' },
  light: { color: '#00000000', symbolColor: '#242424' }
} as const

/** Solid fallback for Windows 10, where there is no Mica backdrop to show through. */
const WINDOW_BACKGROUND = { dark: '#202020', light: '#f3f3f3' } as const

/**
 * Mica needs Windows 11 22H2, not merely Windows 11: `setBackgroundMaterial`
 * is documented as 22H2 and up, and on 21H2 (builds 22000-22620) the backdrop
 * is not drawn. Gating on 22000 would take the Mica branch on those builds and
 * skip the solid fallback, leaving the window with no opaque background.
 *
 * `os.release()` reports the NT version as `10.0.<build>` on every Windows
 * since 10, so the build number is the only part that distinguishes them.
 */
const MICA_MIN_BUILD = 22621

let maximizeOnReveal = false
let mainWindow: BrowserWindow | null = null

function supportsMica(): boolean {
  if (process.platform !== 'win32') return false
  const build = Number(release().split('.')[2])
  return Number.isFinite(build) && build >= MICA_MIN_BUILD
}

function titleBarOverlay(): TitleBarOverlayOptions {
  const colors = nativeTheme.shouldUseDarkColors ? OVERLAY_COLORS.dark : OVERLAY_COLORS.light
  return { ...colors, height: TITLE_BAR_HEIGHT }
}

/** Mica where it is supported, a plain painted background everywhere else. */
function backdropOptions(): BrowserWindowConstructorOptions {
  if (supportsMica()) return { backgroundMaterial: 'mica' }
  const dark = nativeTheme.shouldUseDarkColors
  return { backgroundColor: dark ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light }
}

/**
 * The dev server URL, and only in development.
 *
 * electron-vite sets `ELECTRON_RENDERER_URL` when it starts the dev server. A
 * packaged build must ignore it: anything able to set an environment variable
 * in the user's session could otherwise point the main window, preload bridge
 * and all, at a page of its choosing. `isAppUrl` keys off the same value, so an
 * unguarded read would also move the navigation allowlist to that origin.
 */
export function devRendererUrl(): string | undefined {
  if (app.isPackaged) return undefined
  return process.env['ELECTRON_RENDERER_URL']
}

export function createMainWindow(): BrowserWindow {
  const state = loadWindowState()
  const position = state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}

  const win = new BrowserWindow({
    ...position,
    width: state.width,
    height: state.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    paintWhenInitiallyHidden: true,
    title: 'Barista',
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay(),
    ...backdropOptions(),
    icon: join(__dirname, '../renderer/branding/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Allow the readiness paint while the splash covers this hidden window.
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  trustIpcSender(win.webContents)

  // Startup owns visibility; preserve the saved maximize state until reveal.
  maximizeOnReveal = state.maximized

  win.on('closed', () => {
    disposePrintWindow()
    if (mainWindow === win) mainWindow = null
  })

  // Electron 44 can defer hidden overlay-window frames. A hidden capture asks
  // Chromium to paint without revealing the native window; startup still waits
  // for the renderer's explicit readiness notification.
  win.webContents.once('did-finish-load', () => {
    void win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).catch(() => {
      // Best effort: some Windows compositors report UnknownVizError even after
      // delivering the requested frame. The readiness watchdog handles failure.
    })
  })

  watchWorkspaceClose(win)
  watchWindowState(win)

  const rendererUrl = devRendererUrl()
  if (rendererUrl !== undefined) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
  return win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Repaints the system window buttons after a theme change. The overlay is drawn
 * by the OS, so it does not follow the renderer's stylesheet.
 */
export function refreshTitleBarOverlay(): void {
  if (process.platform === 'darwin') return
  // Only the main window has the overlay enabled, and setTitleBarOverlay throws
  // on a window that does not.
  const win = mainWindow
  if (win === null || win.isDestroyed()) return
  win.setTitleBarOverlay(titleBarOverlay())
}

export function revealMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (maximizeOnReveal) mainWindow.maximize()
  mainWindow.show()
}
