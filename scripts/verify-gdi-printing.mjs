/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global document, window */
import { _electron } from 'playwright-core'
import { PDFDocument } from 'pdf-lib'
import * as fs from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve('scratch/verification/0.3.0/gdi-print.pdf')
await fs.rm(output, { force: true })
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
  await page.getByText('Untitled', { exact: true }).first().waitFor()
  await page.keyboard.press('Control+p')
  const print = page.getByRole('dialog', { name: 'Print' })
  const printer = print.getByLabel('Printer')
  await printer.waitFor()
  const pdfOption = printer.locator('option').filter({ hasText: 'Microsoft Print to PDF' }).first()
  const hasPdf = await pdfOption
    .waitFor({ state: 'attached', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  if (!hasPdf) {
    const discovery = await page.evaluate(() => window.barista.invoke('printer:list'))
    throw new Error(`Microsoft Print to PDF is not enumerated: ${JSON.stringify(discovery)}`)
  }
  await printer.selectOption({ label: await pdfOption.textContent() })
  await print.getByLabel('GDI native (for drivers that ignore custom sizes)').check()
  await print.getByLabel('Actual size').check()
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
  }, output)
  await print.getByAltText('Print preview').waitFor()
  await page.screenshot({ path: 'scratch/verification/0.3.0/gdi-printing.png' })
  await print.getByRole('button', { name: 'Print', exact: true }).click()
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.startsWith('Printing')
      ),
    undefined,
    { timeout: 30000 }
  )
  const alert = await print.getByRole('alert').allTextContents()
  if (alert.length) throw new Error(alert.join('\n'))
  const pdf = await PDFDocument.load(await fs.readFile(output)),
    pageSize = pdf.getPage(0).getSize(),
    widthMm = (pageSize.width * 25.4) / 72,
    heightMm = (pageSize.height * 25.4) / 72
  const exact = Math.abs(widthMm - 60) <= 0.2 && Math.abs(heightMm - 35) <= 0.2
  await fs.writeFile(
    'scratch/verification/0.3.0/gdi-result.json',
    JSON.stringify(
      {
        printer: 'Microsoft Print to PDF',
        requestedMm: { width: 60, height: 35 },
        actualMm: { width: widthMm, height: heightMm },
        customPaperAccepted: exact
      },
      null,
      2
    )
  )
  if (runtimeErrors.length) throw new Error(runtimeErrors.join('\n'))
  console.log(
    `Verified GDI native print to Microsoft Print to PDF. The driver ${exact ? 'accepted' : 'rejected'} 60 × 35 mm custom media and produced ${widthMm.toFixed(2)} × ${heightMm.toFixed(2)} mm.`
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
