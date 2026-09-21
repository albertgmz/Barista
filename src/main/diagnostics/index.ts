/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { DiagnosticLevel } from '@shared/diagnostics'
import { SettingsStoreFile } from '../storage/settings'
import { userDataPaths } from '../storage/paths'
import { RollingJsonLogger } from './logger'

let logger: RollingJsonLogger | null = null

export function configureCrashDumpPath(): void {
  app.setPath('crashDumps', join(app.getPath('userData'), 'crash'))
}

export async function initializeDiagnostics(): Promise<void> {
  const paths = userDataPaths()
  await Promise.all([
    mkdir(paths.logsDir, { recursive: true }),
    mkdir(app.getPath('crashDumps'), { recursive: true })
  ])
  let level: DiagnosticLevel = 'info'
  try {
    level = (await new SettingsStoreFile().read()).diagnostics.level
  } catch {
    // Defaults remain safe if settings cannot be loaded.
  }
  if (process.argv.includes('--verbose')) level = 'debug'
  logger = new RollingJsonLogger({ directory: paths.logsDir, level })
  await logger.initialize()
  logger.info('app.start', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    verbose: process.argv.includes('--verbose')
  })
}

export function setDiagnosticLevel(level: DiagnosticLevel): void {
  logger?.setLevel(process.argv.includes('--verbose') ? 'debug' : level)
}

export const diagnosticLog = {
  error: (event: string, context?: unknown, message?: string): void =>
    logger?.error(event, context, message),
  warn: (event: string, context?: unknown, message?: string): void =>
    logger?.warn(event, context, message),
  info: (event: string, context?: unknown, message?: string): void =>
    logger?.info(event, context, message),
  debug: (event: string, context?: unknown, message?: string): void =>
    logger?.debug(event, context, message),
  flush: async (): Promise<void> => logger?.flush()
}
