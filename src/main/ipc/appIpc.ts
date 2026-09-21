/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import type { ThirdPartyLicense } from '@shared/licenses'
import { fromService, handle } from './typedIpc'
import { getMainWindow } from '@main/windows/mainWindow'
import { generatedResourcePath, readBuildInfo } from '../buildInfo'

const EXTERNAL_URLS = {
  repository: 'https://github.com/albertgmz/Barista',
  releases: 'https://github.com/albertgmz/Barista/releases',
  gpl: 'https://www.gnu.org/licenses/gpl-3.0.html'
} as const

function installType(): 'installed' | 'portable' | 'development' {
  if (!app.isPackaged) return 'development'
  return process.env['PORTABLE_EXECUTABLE_FILE'] ? 'portable' : 'installed'
}

export function registerAppIpc(): void {
  handle('app:exit', () => {
    app.quit()
  })
  handle('app:getInfo', async () => {
    const build = await readBuildInfo()
    return {
      name: 'Barista',
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      isPackaged: app.isPackaged,
      codename: build.codename,
      buildDate: build.buildDate,
      commit: build.commit,
      installType: installType(),
      userDataPath: app.getPath('userData')
    }
  })
  handle('app:openExternal', async (target) => {
    await shell.openExternal(EXTERNAL_URLS[target])
  })
  handle('licenses:list', () =>
    fromService('Reading third-party licenses', async () => {
      const parsed = JSON.parse(
        await readFile(generatedResourcePath('third-party-licenses.json'), 'utf8')
      ) as { entries?: ThirdPartyLicense[] }
      if (!Array.isArray(parsed.entries)) throw new Error('The license catalog is invalid.')
      return parsed.entries
    })
  )
  handle('window:minimize', () => getMainWindow()?.minimize())
  handle('window:toggleMaximize', () => {
    const window = getMainWindow()
    if (window?.isMaximized()) window.unmaximize()
    else window?.maximize()
  })
  handle('window:close', () => getMainWindow()?.close())
}
