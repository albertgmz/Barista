/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { BrowserWindow, nativeTheme } from 'electron'
import type { ThemeInfo, ThemeSource } from '@shared/ipc/contract'
import { handle, sendTo } from './typedIpc'

const THEME_SOURCES: readonly ThemeSource[] = ['system', 'light', 'dark']

/** The current theme as the renderer needs to see it. */
export function themeInfo(): ThemeInfo {
  return {
    source: nativeTheme.themeSource,
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors
  }
}

export function broadcastThemeChange(): void {
  const info = themeInfo()
  for (const win of BrowserWindow.getAllWindows()) {
    sendTo(win, 'theme:changed', info)
  }
}

export function registerThemeIpc(): void {
  handle('theme:get', () => themeInfo())

  handle('theme:set', (source) => {
    // This channel answers with ThemeInfo rather than a result envelope, so it
    // has no way to report an error. Electron throws on a value outside the
    // enum, so an unrecognised source leaves the theme untouched instead.
    if (THEME_SOURCES.includes(source)) nativeTheme.themeSource = source
    return themeInfo()
  })
}
