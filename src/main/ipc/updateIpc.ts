/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { handle } from './typedIpc'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  openReleasesPage,
  updateState
} from '../updates/service'

export function registerUpdateIpc(): void {
  handle('updates:getState', () => updateState())
  handle('updates:check', () => checkForUpdates())
  handle('updates:download', () => downloadUpdate())
  handle('updates:install', () => installUpdate())
  handle('updates:openReleases', async () => {
    await openReleasesPage()
  })
}
