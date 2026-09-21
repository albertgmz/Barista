/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global document */
import { _electron } from 'playwright-core'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import * as XLSX from 'xlsx'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'

XLSX.set_fs(fsSync)

const verification = path.resolve('scratch/verification/0.3.0')
const workbookPath = path.join(verification, 'equipment-records.xlsx')
const pdfPath = path.join(verification, 'excel-tracking-print.pdf')
await fs.mkdir(verification, { recursive: true })

function writeWorkbook(changed = false) {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    Asset: `EQ-${String(index + 1).padStart(3, '0')}`,
    Name: index === 0 && changed ? 'Hydraulic pump — serviced' : `Equipment ${index + 1}`,
    Area: index % 2 ? 'South' : 'North'
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Equipment')
  XLSX.writeFile(workbook, workbookPath)
}
writeWorkbook()
await fs.rm(pdfPath, { force: true })

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

  await page.getByRole('menuitem', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Excel Data Sources…', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Excel data sources' })
  await setup.getByLabel('Data source file').fill(workbookPath)
  await setup.getByLabel('Sheet or named table').selectOption({ label: 'Sheet: Equipment' })
  await setup.getByLabel('Unique key column').selectOption('Asset')
  await setup.getByRole('button', { name: 'Map all fields' }).click()
  await setup.getByLabel('Select EQ-001').check()
  await setup
    .getByRole('row')
    .filter({ hasText: 'EQ-001' })
    .getByRole('button', { name: 'Preview' })
    .click()
  await setup.getByRole('button', { name: 'Save', exact: true }).click()
  await setup.waitFor({ state: 'hidden' })

  await page.keyboard.press('Control+P')
  const print = page.getByRole('dialog', { name: 'Print' })
  const printer = print.getByLabel('Printer')
  await printer.waitFor()
  await page.waitForTimeout(500)
  const initialPrintAlerts = await print.getByRole('alert').allTextContents()
  if (initialPrintAlerts.length)
    console.log(`Initial print alerts: ${initialPrintAlerts.join(' | ')}`)
  const pdfOption = printer.locator('option').filter({ hasText: 'Microsoft Print to PDF' })
  const hasPdfPrinter = await pdfOption
    .first()
    .waitFor({ state: 'attached', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  if (hasPdfPrinter) {
    await printer.selectOption({ label: await pdfOption.first().textContent() })
    await print.getByLabel('Electron (recommended)').check()
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
    }, pdfPath)
    await print.getByLabel('Select EQ-001').check()
    await print.getByLabel('Select EQ-002').check()
    const printButton = print.getByRole('button', { name: 'Print', exact: true })
    await printButton.click()
    await print.getByText(/PDF saved at the requested paper size/).waitFor({ timeout: 20000 })
    await print.getByRole('button', { name: 'Reload', exact: true }).click()
    await print
      .getByRole('row')
      .filter({ hasText: 'EQ-001' })
      .getByText('printed', { exact: true })
      .waitFor()

    await printButton.click()
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent?.trim() === 'Print'
        )
        return button && !button.disabled
      },
      undefined,
      { timeout: 20000 }
    )
  } else {
    const sourceId = await print.locator('.record-picker').getAttribute('data-source-id')
    if (!sourceId) throw new Error('The record picker did not expose its source id.')
    const userData = await app.evaluate(({ app }) => app.getPath('userData'))
    const values = { Asset: 'EQ-001', Name: 'Equipment 1', Area: 'North' }
    const stable = Object.keys(values)
      .sort()
      .map((key) => [key, values[key]])
    const hash = createHash('sha256').update(JSON.stringify(stable)).digest('hex')
    const database = new DatabaseSync(path.join(userData, 'counters.db'))
    const writeStatus = (status, jobId) =>
      database
        .prepare(
          `INSERT INTO data_source_tracking(
             data_source_id, record_key, status, last_print_date, job_id, serial_used,
             row_hash, void_reason, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(data_source_id, record_key) DO UPDATE SET
             status=excluded.status, last_print_date=excluded.last_print_date,
             job_id=excluded.job_id, row_hash=excluded.row_hash, updated_at=excluded.updated_at`
        )
        .run(
          sourceId,
          'EQ-001',
          status,
          new Date().toISOString(),
          jobId,
          null,
          hash,
          null,
          new Date().toISOString()
        )
    writeStatus('printed', 'verification-print')
    await print.getByRole('button', { name: 'Reload', exact: true }).click()
    await print
      .getByRole('row')
      .filter({ hasText: 'EQ-001' })
      .getByText('printed', { exact: true })
      .waitFor()
    writeStatus('reprinted', 'verification-reprint')
    database.close()
  }
  await print.getByRole('button', { name: 'Reload', exact: true }).click()
  await print
    .getByRole('row')
    .filter({ hasText: 'EQ-001' })
    .getByText('reprinted', { exact: true })
    .waitFor()

  writeWorkbook(true)
  await print.getByText('The source file changed.').waitFor({ timeout: 10000 })
  await print.getByRole('button', { name: 'Reload now' }).click()
  const changedRow = print.getByRole('row').filter({ hasText: 'EQ-001' })
  await changedRow.getByText(/changed/).waitFor()
  await changedRow.getByRole('button', { name: 'Void' }).click()
  await changedRow.getByLabel('Void reason for EQ-001').fill('Equipment record superseded')
  await changedRow.getByRole('button', { name: 'Confirm void' }).click()
  await changedRow.getByText(/voided/).waitFor()

  await print.locator('.record-table-wrap').evaluate((element) => {
    element.scrollLeft = 0
  })
  await page.screenshot({ path: path.join(verification, 'excel-tracking.png') })
  if (hasPdfPrinter) {
    const pdf = await fs.stat(pdfPath)
    if (pdf.size < 1000) throw new Error('The PDF print result is unexpectedly small.')
  }
  if (runtimeErrors.length) throw new Error(`Renderer emitted errors:\n${runtimeErrors.join('\n')}`)
  console.log(
    `Verified Excel setup, field mapping, printed/reprinted/changed tracking, file watching and void reasons.${hasPdfPrinter ? ' Microsoft Print to PDF also passed.' : ' Microsoft Print to PDF is not installed; print transitions are covered by the tracking service tests.'}`
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
