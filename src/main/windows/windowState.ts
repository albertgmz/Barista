/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Remembers where the main window was last left.
 *
 * Restoring blindly is a known way to lose a window: a layout saved on a second
 * monitor puts it off-screen once that monitor is gone. Saved bounds are only
 * used when the window's drag strip would still land on a connected display.
 */

import { screen } from 'electron'
import type { BrowserWindow, Rectangle } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { userDataPaths } from '@main/storage/paths'

export interface WindowState {
  /** Absent when the window has never been placed, or its display is gone. */
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULT_STATE: WindowState = { width: 1440, height: 900, maximized: false }

/** Long enough to collapse a drag into one write, short enough to survive a kill. */
const SAVE_DEBOUNCE_MS = 400

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseState(raw: string): WindowState | null {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) return null

  const { x, y, width, height, maximized } = parsed as Record<string, unknown>
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null
  if (width <= 0 || height <= 0) return null

  const state: WindowState = { width, height, maximized: maximized === true }
  if (isFiniteNumber(x) && isFiniteNumber(y)) {
    state.x = x
    state.y = y
  }
  return state
}

function contains(area: Rectangle, x: number, y: number): boolean {
  return x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height
}

/**
 * How far into the window the reachability probe sits: far enough right to
 * clear the left edge, and within the title bar band.
 */
const GRAB_POINT_INSET = { x: 40, y: 20 }

/**
 * True when the user could actually grab the restored window.
 *
 * Testing for mere overlap with a display is not enough. A saved `y` of -700
 * on a 900-tall window still overlaps the primary display, but its title bar
 * sits above the screen — and because the title bar is drawn by the renderer
 * behind `titleBarStyle: 'hidden'`, there is no native caption to drag and no
 * Alt+Space menu to fall back on. So the probe is a point inside the drag
 * strip, which must land in some display's work area.
 */
function isReachable(bounds: Rectangle): boolean {
  const x = bounds.x + GRAB_POINT_INSET.x
  const y = bounds.y + GRAB_POINT_INSET.y
  return screen.getAllDisplays().some((display) => contains(display.workArea, x, y))
}

/** Must be called after the app is ready; it reads the display layout. */
export function loadWindowState(): WindowState {
  let saved: WindowState | null = null
  try {
    saved = parseState(readFileSync(userDataPaths().windowStateFile, 'utf8'))
  } catch {
    // No file yet, or an unreadable one: the defaults are a fine answer.
  }
  if (saved === null) return { ...DEFAULT_STATE }

  if (saved.x !== undefined && saved.y !== undefined) {
    const bounds = { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
    if (!isReachable(bounds)) return { ...DEFAULT_STATE }
  }
  return saved
}

function writeState(state: WindowState): void {
  const file = userDataPaths().windowStateFile
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  } catch {
    // A forgotten window layout is not worth interrupting the user over.
  }
}

function captureState(win: BrowserWindow): WindowState {
  // Normal bounds, so restoring a maximized window returns it to its old size.
  const bounds = win.getNormalBounds()
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: win.isMaximized()
  }
}

/** Starts persisting `win`'s geometry. */
export function watchWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null

  const save = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    // A minimized window reports isMaximized() as false and would overwrite a
    // correct maximized state with a wrong one.
    if (win.isDestroyed() || win.isMinimized()) return
    writeState(captureState(win))
  }

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(save, SAVE_DEBOUNCE_MS)
  }

  win.on('resize', schedule)
  win.on('move', schedule)
  // The debounce would otherwise drop the last change of the session.
  win.on('close', save)
}
