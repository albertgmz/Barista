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

  const canvas = page.locator('.canvas-container canvas.upper-canvas')
  // The label is zoomed to fit and centred in whatever canvas area the window
  // gives it, and a click outside the label is ignored, so placements are
  // fractions of the shorter canvas side rather than fixed pixels. The fit
  // leaves the label at 90% of the canvas, so the default 60 x 35 mm stock
  // always covers at least +/- 0.4 of that side across and +/- 0.25 down.
  const labelPoint = async (fx = 0, fy = 0) => {
    const box = await canvas.boundingBox()
    if (!box) throw new Error('Canvas has no bounding box.')
    const span = Math.min(box.width, box.height)
    return { x: Math.round(box.width / 2 + fx * span), y: Math.round(box.height / 2 + fy * span) }
  }
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await canvas.click({ position: await labelPoint() })

  // Inline editing commits once: the box grows to hold the text that was typed,
  // and a single undo takes the whole edit back.
  const content = page.getByRole('textbox', { name: 'Text content' })
  await content.waitFor()
  await canvas.dblclick({ position: await labelPoint(0.04, 0.02) })
  await page.keyboard.press('End')
  await page.keyboard.type(' box wrapped onto several lines')
  await page.keyboard.press('Escape')
  await page.waitForFunction(
    () =>
      document.querySelector('[role="textbox"][aria-label="Text content"]')?.innerText ===
        'Text box wrapped onto several lines' &&
      Number(document.querySelector('input[aria-label="Height (mm)"]')?.value) > 10
  )
  await page.keyboard.press('Control+z')
  await page.waitForFunction(
    () =>
      document.querySelector('[role="textbox"][aria-label="Text content"]')?.innerText === 'Text' &&
      Number(document.querySelector('input[aria-label="Height (mm)"]')?.value) === 10
  )

  await content.fill('This equipment description cannot fit in the configured text box')
  await page.getByLabel('Width (mm)').fill('6')
  await page.getByLabel('Height (mm)').fill('3')
  await page.getByLabel('Font size (pt)').fill('18')
  await page.getByLabel('Fit mode').selectOption('shrink')
  await page.getByLabel('Minimum font size (pt)').fill('12')
  await page.getByLabel('Maximum lines').fill('1')

  // Entering and leaving an inline edit without typing must leave the box the
  // user sized alone, even though its text overflows. A commit lands within the
  // key press, well inside this settle. Width matters as much as height here:
  // a textbox widens itself to its longest word rather than breaking it, so a
  // box narrower than one word grows on every edit unless the commit is guarded,
  // dragging X along with it.
  const box = await page.getByLabel('X (mm)').inputValue()
  await canvas.dblclick({ position: await labelPoint(0.04, 0.02) })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const height = await page.getByLabel('Height (mm)').inputValue()
  if (height !== '3') throw new Error(`Leaving an edit without typing resized the box to ${height}`)
  const width = await page.getByLabel('Width (mm)').inputValue()
  if (width !== '6') throw new Error(`Leaving an edit without typing widened the box to ${width}`)
  const x = await page.getByLabel('X (mm)').inputValue()
  if (x !== box) throw new Error(`Leaving an edit without typing moved X from ${box} to ${x}`)

  await page.getByRole('tab', { name: 'Preflight' }).click()
  const panel = page.getByRole('region', { name: 'Preflight results' })
  await panel.getByText(/still overflows at its 12.00 pt minimum/).waitFor()
  await panel
    .getByText(/errors/)
    .first()
    .waitFor()
  await panel.getByRole('button', { name: /still overflows/ }).click()

  await page.keyboard.press('Control+,')
  const preferences = page.getByRole('dialog', { name: 'Preferences' })
  await preferences.getByLabel('Preflight before printing').selectOption('strict')
  await preferences.getByRole('button', { name: 'Save' }).click()
  await preferences.waitFor({ state: 'hidden' })

  await page.keyboard.press('Control+P')
  const print = page.getByRole('dialog', { name: 'Print' })
  await print.getByText(/Preflight: [1-9][0-9]* errors/).waitFor()
  const printButton = print.getByRole('button', { name: 'Print', exact: true })
  if (!(await printButton.isDisabled())) throw new Error('Strict preflight did not disable Print.')

  await fs.mkdir('docs/verification/0.3.0', { recursive: true })
  await page.screenshot({ path: 'docs/verification/0.3.0/preflight.png' })
  await print.getByRole('button', { name: 'Cancel' }).click()
  await page.keyboard.press('Control+,')
  await preferences.getByLabel('Preflight before printing').selectOption('warn')
  await preferences.getByRole('button', { name: 'Save' }).click()
  if (runtimeErrors.length) throw new Error(`Renderer emitted errors:\n${runtimeErrors.join('\n')}`)
  console.log('Verified live preflight selection, print summary and strict-mode print blocking.')
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
