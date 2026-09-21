/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global document */
import { _electron } from 'playwright-core'
import * as fs from 'node:fs/promises'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const app = await _electron.launch({
  args: ['.'],
  env: { ...env, BARISTA_SPLASH_MIN_MS: '0' }
})

try {
  let page = app.windows().find((candidate) => !candidate.url().includes('splash'))
  if (!page)
    page = await app.waitForEvent('window', {
      predicate: (candidate) => !candidate.url().includes('splash')
    })

  await page.locator('body').waitFor()
  console.log('Window URL:', page.url())
  console.log('Window title:', await page.title())
  console.log('Visible text:', (await page.locator('body').innerText()).slice(0, 500))

  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await page.getByText('Untitled', { exact: true }).first().waitFor()
  await page.keyboard.press('Control+,')
  await page.getByRole('dialog', { name: 'Preferences' }).waitFor()
  await page.getByRole('tab', { name: 'Data', exact: true }).click()
  await page.getByLabel('Data store', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Test connection', exact: true }).click()
  await page.getByText('Local SQLite database is ready.', { exact: true }).waitFor()
  await page.getByText(/Connected · schema 1 of 1 · integrity ok/).waitFor()
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll('button')).some(
        (button) => button.textContent === 'Test connection' && button.disabled
      )
  )

  await fs.mkdir('scratch/verification/0.3.0', { recursive: true })
  await page.screenshot({ path: 'scratch/verification/0.3.0/data-preferences.png' })

  await page.getByLabel('Data store', { exact: true }).selectOption('mysql')
  await page.getByLabel('Host', { exact: true }).waitFor()
  await page.getByLabel('Password', { exact: true }).waitFor()
  await page.getByText('Require TLS and verify the server certificate', { exact: true }).waitFor()

  if (runtimeErrors.length > 0)
    throw new Error(`Renderer emitted errors:\n${runtimeErrors.join('\n')}`)
  console.log('Verified Preferences > Data and local SQLite connection status.')
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
