/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global window */
import { _electron } from 'playwright-core'
import * as fs from 'node:fs/promises'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

await fs.mkdir('scratch/verification/0.4.0', { recursive: true })
const app = await _electron.launch({
  args: ['.'],
  env: { ...env, BARISTA_SPLASH_MIN_MS: '10000' }
})

try {
  const splash = await app.waitForEvent('window', {
    predicate: (candidate) => candidate.url().includes('splash')
  })
  await splash.getByText('Barista', { exact: true }).waitFor()
  await splash.screenshot({ path: 'scratch/verification/0.4.0/splash.png' })

  let page = app.windows().find((candidate) => !candidate.url().includes('splash'))
  if (!page)
    page = await app.waitForEvent('window', {
      predicate: (candidate) => !candidate.url().includes('splash')
    })
  await page.getByText('Untitled', { exact: true }).first().waitFor()

  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await page.getByRole('menuitem', { name: 'Help', exact: true }).click()
  await page.getByRole('menuitem', { name: 'About', exact: true }).click()
  const about = page.getByRole('dialog', { name: 'About Barista' })
  await about.waitFor()
  await about.getByText('0.5.1 “Latte”', { exact: true }).waitFor()
  await about.getByText(/No telemetry\. No data collection\./).waitFor()
  await page.waitForTimeout(250)
  await page.screenshot({ path: 'scratch/verification/0.4.0/about.png' })
  await about.screenshot({ path: 'scratch/verification/0.4.0/about-dialog.png' })

  await about.getByRole('button', { name: 'Open-source licenses' }).click()
  const licenses = page.getByRole('dialog', { name: 'Open-source licenses' })
  await licenses.waitFor()
  const licenseCatalog = await page.evaluate(() => window.barista.invoke('licenses:list'))
  if (!licenseCatalog.ok)
    throw new Error(`License catalog could not be loaded: ${licenseCatalog.error.message}`)
  await licenses.getByLabel('Search licenses').waitFor()
  await licenses.getByLabel('Search licenses').fill('OCR-B')
  await licenses.getByRole('button', { name: /OCR-B/ }).waitFor()
  await licenses.getByText('SIL OFL 1.1', { exact: true }).waitFor()
  await page.waitForTimeout(250)
  await page.screenshot({ path: 'scratch/verification/0.4.0/licenses.png' })
  await licenses.getByRole('button', { name: 'Close' }).click()

  await page.keyboard.press('Control+,')
  const preferences = page.getByRole('dialog', { name: 'Preferences' })
  await preferences.waitFor()
  await preferences.getByRole('tab', { name: 'Updates' }).click()
  await preferences.getByText('Check for updates automatically').waitFor()
  await page.waitForTimeout(250)
  await page.screenshot({ path: 'scratch/verification/0.4.0/update-preferences.png' })

  if (runtimeErrors.length > 0)
    throw new Error(`Renderer emitted errors:\n${runtimeErrors.join('\n')}`)
  console.log('Verified splash, About, licenses, and update preferences.')
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
