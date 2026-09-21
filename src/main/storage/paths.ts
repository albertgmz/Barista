/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Every path Barista writes to.
 *
 * All of them hang off `app.getPath('userData')`. Nothing is ever written to
 * the install folder: it is read-only for standard users under Program Files
 * and is replaced wholesale on update.
 */

import { app } from 'electron'
import { join } from 'node:path'

export interface UserDataPaths {
  /** The per-user root that holds everything below. */
  root: string
  workspaceFile: string
  settingsFile: string
  dataConfigurationFile: string
  windowStateFile: string
  templatesDir: string
  assetsDir: string
  fontsDir: string
  countersDb: string
  recoveryDir: string
  logsDir: string
  diagnosticsDir: string
}

/**
 * Resolved on every call rather than once at module load, because
 * `app.getPath` is only meaningful after the app name is set.
 */
export function userDataPaths(): UserDataPaths {
  const root = app.getPath('userData')
  return {
    root,
    workspaceFile: join(root, 'workspace.json'),
    settingsFile: join(root, 'settings.json'),
    dataConfigurationFile: join(root, 'data-connection.json'),
    windowStateFile: join(root, 'window-state.json'),
    templatesDir: join(root, 'templates'),
    assetsDir: join(root, 'assets'),
    fontsDir: join(root, 'fonts'),
    countersDb: join(root, 'counters.db'),
    recoveryDir: join(root, 'recovery'),
    logsDir: join(root, 'logs'),
    diagnosticsDir: join(root, 'diagnostics')
  }
}
