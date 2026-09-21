/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global document */
import { _electron } from 'playwright-core'
import * as fs from 'node:fs/promises'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ args: ['.'], env: { ...env, BARISTA_SPLASH_MIN_MS: '0' } })

try {
  let page = app.windows().find((candidate) => !candidate.url().includes('splash'))
  if (!page)
    page = await app.waitForEvent('window', {
      predicate: (candidate) => !candidate.url().includes('splash')
    })
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await page.getByText('Untitled', { exact: true }).first().waitFor()
  await page.keyboard.press('Control+n')
  const dialog = page.getByRole('dialog', { name: 'New Label' })
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'My Presets' }).click()
  const oldPresets = dialog.getByRole('button', { name: /Equipment 60x35/ })
  while ((await oldPresets.count()) > 0) {
    await oldPresets.first().click()
    await dialog.getByRole('button', { name: 'Delete preset' }).click()
  }
  await dialog.getByRole('button', { name: 'Thermal – metric' }).click()
  await dialog.getByRole('button', { name: /60 × 35 mm/ }).click()
  await dialog.getByLabel('Name').fill('Equipment 60x35')
  await dialog.getByLabel('Safe margin').fill('2.5')
  await dialog.getByRole('button', { name: 'Save as preset' }).click()
  await dialog.getByRole('button', { name: 'My Presets' }).click()
  await dialog
    .getByRole('button', { name: /Equipment 60x35/ })
    .first()
    .waitFor()

  await fs.mkdir('scratch/verification/0.3.0', { recursive: true })
  await page.screenshot({ path: 'scratch/verification/0.3.0/new-label-dialog.png' })
  await dialog.getByRole('button', { name: 'Create' }).click()
  await dialog.waitFor({ state: 'hidden' })

  await page.getByRole('menuitem', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Label Setup...', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Label Setup' })
  await setup.waitFor()
  if ((await setup.getByLabel('Safe margin').inputValue()) !== '2.5')
    throw new Error('Label Setup did not reuse the stock editor state.')
  await setup.getByRole('button', { name: 'Cancel' }).click()

  await page.waitForFunction(
    () => document.querySelector('[aria-label="Label workspace"]') !== null
  )
  if (runtimeErrors.length) throw new Error(`Renderer emitted errors:\n${runtimeErrors.join('\n')}`)
  console.log(
    'Verified New Label presets, custom preset persistence, creation, and Label Setup reuse.'
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
