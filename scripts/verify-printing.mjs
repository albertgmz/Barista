/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global document, window */
import { _electron } from 'playwright-core'
import { PDFDocument } from 'pdf-lib'
import * as fs from 'node:fs/promises'
import path from 'node:path'
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const labelPath = path.join(process.env.APPDATA, 'barista', 'verification', 'calibration.bar')
const app = await _electron.launch({
  args: ['.', labelPath],
  env: { ...env, BARISTA_SPLASH_MIN_MS: '0' }
})
try {
  let page = app.windows().find((p) => !p.url().includes('splash'))
  if (!page)
    page = await app.waitForEvent('window', { predicate: (p) => !p.url().includes('splash') })
  page.on('pageerror', (e) => console.error('Renderer error:', e.message))
  await page.getByRole('button', { name: 'Select image', exact: true }).waitFor()
  const geo = async (x, y, w, h) => {
    for (const [label, value] of [
      ['X (mm)', x],
      ['Y (mm)', y],
      ['Width (mm)', w],
      ['Height (mm)', h]
    ])
      await page.getByLabel(label, { exact: true }).fill(String(value))
    await page.getByLabel('Height (mm)', { exact: true }).blur()
  }
  await page.getByRole('button', { name: 'Select text', exact: true }).nth(2).click()
  if ((await page.getByLabel('Text content', { exact: true }).inputValue()) !== 'ACME INSTRUMENTS')
    throw new Error('Unexpected company object')
  await geo(4, 3, 48, 5)
  await page.getByRole('button', { name: 'Select text', exact: true }).nth(0).click()
  if (!(await page.getByLabel('Text content', { exact: true }).inputValue()).startsWith('Asset:'))
    throw new Error('Unexpected details object')
  await geo(4, 14, 34, 13)
  await page.getByLabel('Font family', { exact: true }).selectOption('JetBrains Mono')
  await page.getByRole('button', { name: 'Select', exact: true }).focus()
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(300)
  await page.mouse.click(1050, 830)
  await page.screenshot({ path: 'docs/verification/editor.png' })
  await page.keyboard.press('Control+p')
  await page.getByLabel('Printer', { exact: true }).selectOption('Microsoft Print to PDF')
  await page.getByAltText('Print preview', { exact: true }).waitFor()
  const results = []
  for (const [name, width, height, preset] of [
    ['60x35', 60, 35, '60,35'],
    ['4x6', 101.6, 152.4, '101.6,152.4'],
    ['2x1', 50.8, 25.4, '50.8,25.4']
  ]) {
    if (name !== '60x35') {
      await page.getByRole('button', { name: /Page Setup/ }).click()
      await page.getByLabel('Label preset', { exact: true }).selectOption(preset)
      await page.getByRole('button', { name: 'OK', exact: true }).click()
    }
    await page.getByLabel('Choose paper size by label size', { exact: true }).check()
    await page.getByLabel('Auto', { exact: true }).check()
    await page.getByLabel('Copies', { exact: true }).fill('1')
    for (const [mode, title] of [
      ['actual', 'Actual size'],
      ['fit', 'Fit'],
      ['shrink', 'Shrink oversized'],
      ['custom', 'Custom scale']
    ]) {
      await page.getByLabel(title, { exact: true }).check()
      if (mode === 'custom') await page.getByLabel('Scale (%)', { exact: true }).fill('75')
      await page.waitForTimeout(600)
      const output = path.join(path.dirname(labelPath), `exact-${name}-${mode}.pdf`)
      await fs.rm(output, { force: true })
      await app.evaluate(({ dialog }, output) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
      }, output)

      await page.screenshot({ path: 'docs/verification/print-step.png' })
      await page.getByRole('button', { name: 'Print', exact: true }).click()
      await page
        .getByText('PDF saved at the requested paper size.', { exact: true })
        .waitFor({ timeout: 30000 })
      // Status may still be from the previous job; wait for the button to be re-enabled.
      await page.waitForFunction(
        () =>
          !Array.from(document.querySelectorAll('button')).some((b) =>
            b.textContent?.startsWith('Printing')
          ),
        null,
        { timeout: 30000 }
      )
      for (let i = 0; i < 100; i++) {
        try {
          await fs.access(output)
          break
        } catch {
          await page.waitForTimeout(100)
        }
      }
      const pdf = await PDFDocument.load(await fs.readFile(output))
      const sizes = pdf.getPages().map((p) => ({
        widthMm: (p.getWidth() * 25.4) / 72,
        heightMm: (p.getHeight() * 25.4) / 72
      }))
      const pass =
        sizes.length === 1 &&
        sizes.every(
          (s) => Math.abs(s.widthMm - width) < 0.00001 && Math.abs(s.heightMm - height) < 0.00001
        )
      const result = { name, mode, requested: { width, height }, actual: sizes, pass, path: output }
      results.push(result)
      console.log(JSON.stringify(result))
      if (!pass) throw new Error('PDF media size mismatch')
      if (name === '60x35' && mode === 'actual')
        await page.screenshot({ path: 'docs/verification/print-dialog.png' })
    }
  }
  await fs.writeFile('docs/verification/pdf-sizes.json', JSON.stringify(results, null, 2))
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const loaded = await page.evaluate(
    (labelPath) => window.barista.invoke('template:read', { path: labelPath }),
    labelPath
  )
  if (!loaded.ok) throw new Error(loaded.error.message)
  for (const format of ['pdf', 'png']) {
    const output = path.join(path.dirname(labelPath), `calibration-export.${format}`)
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
    }, output)
    const result = await page.evaluate(
      ({ document, format }) => window.barista.invoke('document:export', { document, format }),
      { document: loaded.value, format }
    )
    if (!result.ok) throw new Error(result.error.message)
    const bytes = await fs.readFile(output)
    if (format === 'png' && (bytes.readUInt32BE(16) !== 709 || bytes.readUInt32BE(20) !== 414))
      throw new Error('PNG DPI dimensions mismatch')
    console.log('Export verified', format, bytes.length)
  }
  console.log('Verified all 12 exact-size PDFs and PDF/PNG export.')
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy())
  )
  await app.close().catch(() => {})
}
