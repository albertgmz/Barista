/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface BuildInfo {
  version: string
  codename: string
  buildDate: string
  commit: string
}

export function generatedResourcePath(file: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'generated', file)
    : join(app.getAppPath(), 'resources', 'generated', file)
}

export async function readBuildInfo(): Promise<BuildInfo> {
  try {
    const value = JSON.parse(await readFile(generatedResourcePath('build-info.json'), 'utf8'))
    if (
      typeof value.version === 'string' &&
      typeof value.codename === 'string' &&
      typeof value.buildDate === 'string' &&
      typeof value.commit === 'string'
    ) {
      return value as BuildInfo
    }
  } catch {
    // Development can start before generated resources exist.
  }
  return {
    version: app.getVersion(),
    codename: 'Espresso',
    buildDate: 'unknown',
    commit: 'unknown'
  }
}
