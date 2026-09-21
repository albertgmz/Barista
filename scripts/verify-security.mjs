/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global window */
import { _electron } from 'playwright-core'
import path from 'node:path'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ args: ['.'], env: { ...env, BARISTA_SPLASH_MIN_MS: '0' } })

try {
  let page = app.windows().find((candidate) => !candidate.url().includes('splash'))
  if (!page)
    page = await app.waitForEvent('window', {
      predicate: (candidate) => !candidate.url().includes('splash')
    })
  await page.getByText('Untitled', { exact: true }).first().waitFor()
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')
  if (!csp?.includes("object-src 'none'") || !csp.includes("base-uri 'none'"))
    throw new Error('The editor CSP is incomplete.')
  const preferences = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes('/index.html')
    )
    return window?.webContents.getLastWebPreferences()
  })
  if (
    !preferences ||
    preferences.contextIsolation !== true ||
    preferences.sandbox !== true ||
    preferences.nodeIntegration !== false
  )
    throw new Error(`Unsafe renderer preferences: ${JSON.stringify(preferences)}`)
  const popupOpened = await page.evaluate(() => window.open('https://example.com') !== null)
  if (popupOpened) throw new Error('A renderer popup was not blocked.')

  const preload = path.resolve('out/preload/index.js'),
    html = path.resolve('out/renderer/index.html')
  const rogueResult = await app.evaluate(
    async ({ BrowserWindow }, paths) => {
      const rogue = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: paths.preload,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false
        }
      })
      try {
        await rogue.loadFile(paths.html)
        return await rogue.webContents.executeJavaScript(
          `window.barista.invoke('settings:read').then(() => 'allowed', error => String(error.message))`
        )
      } finally {
        rogue.destroy()
      }
    },
    { preload, html }
  )
  if (!String(rogueResult).includes('Blocked IPC request from an untrusted renderer'))
    throw new Error(`Untrusted IPC was not rejected: ${rogueResult}`)
  console.log(
    'Verified sandboxing, context isolation, CSP, popup denial and IPC sender validation.'
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
