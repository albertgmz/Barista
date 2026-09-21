/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global window */
import { _electron } from 'playwright-core'
import { zipSync, strToU8 } from 'fflate'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const verification = path.resolve('scratch/verification/0.3.0')
const library = path.join(verification, 'station-library')
const workbookPath = path.join(verification, 'equipment-records.xlsx')
const output = path.join(verification, 'station-three-records.pdf')
await fs.mkdir(library, { recursive: true })
await fs.access(workbookPath)
await fs.rm(output, { force: true })
const preview = await fs.readFile(path.join(verification, 'autofit-gs1.png'))
const now = new Date().toISOString()
const sourceId = `station-equipment-${Date.now()}`
const label = {
  version: 2,
  id: 'station-verification-template',
  stock: {
    widthMm: 60,
    heightMm: 35,
    dpi: 300,
    shape: 'rounded',
    cornerRadiusMm: 2,
    safeAreaMarginMm: 2,
    gapMm: 3,
    feed: { kind: 'roll' },
    backgroundColor: '#ffffff'
  },
  design: {
    guides: [],
    objects: [
      {
        id: 'station-text',
        name: 'Equipment title',
        kind: 'text',
        xMm: 5,
        yMm: 8,
        widthMm: 50,
        heightMm: 10,
        rotation: 0,
        locked: false,
        visible: true,
        zIndex: 0,
        text: '{EquipmentName}',
        fontFamily: 'Inter',
        fontSizePt: 18,
        fontWeight: 'bold',
        fontStyle: 'normal',
        align: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.16,
        color: '#000000',
        fitMode: 'shrink',
        minFontSizePt: 8,
        maxLines: 1
      },
      {
        id: 'station-serial',
        name: 'Serial',
        kind: 'text',
        xMm: 15,
        yMm: 22,
        widthMm: 30,
        heightMm: 6,
        rotation: 0,
        locked: false,
        visible: true,
        zIndex: 1,
        text: 'SN {Serial}',
        fontFamily: 'Inter',
        fontSizePt: 10,
        fontWeight: 'normal',
        fontStyle: 'normal',
        align: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.16,
        color: '#000000',
        fitMode: 'none',
        minFontSizePt: 8,
        maxLines: 1
      }
    ]
  },
  variables: [
    {
      id: 'equipment-name',
      name: 'EquipmentName',
      kind: 'field',
      column: 'Name',
      sampleValue: 'Equipment 1'
    },
    {
      id: 'release-serial',
      name: 'Serial',
      kind: 'counter',
      start: 1,
      step: 1,
      padding: 6,
      padChar: '0',
      prefix: '',
      suffix: '',
      scope: 'global',
      sharedName: 'release-equipment',
      format: 'numeric',
      alphabet: '0123456789',
      min: 1,
      max: 999999,
      overflow: 'stop',
      reset: 'never',
      failure: 'void'
    }
  ],
  dataSources: [
    {
      id: sourceId,
      name: 'Equipment records',
      path: workbookPath,
      selection: { kind: 'sheet', name: 'Equipment' },
      headerRow: 1,
      keyColumn: 'Asset',
      filter: null,
      mappings: [{ column: 'Name', variable: 'EquipmentName' }],
      writeStatusColumn: false
    }
  ],
  assets: [],
  metadata: {
    createdAt: now,
    modifiedAt: now,
    title: 'Approved Equipment Label',
    author: 'Barista',
    description: 'Station verification label',
    tags: ['equipment', 'approved'],
    revision: 1,
    status: 'approved'
  }
}
const manifest = {
  format: 'Barista Label',
  formatVersion: 2,
  appVersion: '0.3.0',
  createdAt: now,
  modifiedAt: now,
  assets: [],
  preview: {
    path: 'preview.png',
    sha256: createHash('sha256').update(preview).digest('hex'),
    mimeType: 'image/png',
    byteLength: preview.length
  }
}
await fs.writeFile(
  path.join(library, 'approved-equipment.bar'),
  zipSync(
    {
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'label.json': strToU8(JSON.stringify(label)),
      'preview.png': preview
    },
    { level: 6 }
  )
)

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({
  args: ['.', '--station'],
  env: { ...env, BARISTA_SPLASH_MIN_MS: '0' }
})
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
  await page.getByRole('heading', { name: 'Barista Station' }).waitFor()
  await page.evaluate(() =>
    window.barista.invoke('station:setAdminPin', { currentPin: '2468', newPin: null })
  )
  const configured = await page.evaluate(
    (folder) => window.barista.invoke('library:setFolders', { folders: [folder] }),
    library
  )
  if (!configured.ok) throw new Error(configured.error.message)
  await page.getByRole('button', { name: 'Refresh library' }).click()
  const card = page.getByRole('button', { name: /Approved Equipment Label/ })
  await card.waitFor()
  await page.getByLabel('Search approved templates').fill('equipment')
  await card.click()
  await page.getByRole('heading', { name: 'Approved Equipment Label' }).waitFor()
  await page.getByLabel('Select EQ-001').check()
  await page.getByLabel('Select EQ-002').check()
  await page.getByLabel('Select EQ-003').check()
  await page.getByText(/Preflight: 0 errors/).waitFor()
  await page.getByAltText('Label preview').waitFor()
  const printer = page.getByLabel('Printer')
  const pdfOption = printer.locator('option').filter({ hasText: 'Microsoft Print to PDF' }).first()
  await pdfOption.waitFor({ state: 'attached', timeout: 10000 })
  const printerId = await pdfOption.getAttribute('value')
  if (!printerId) throw new Error('Microsoft Print to PDF did not expose a printer id.')
  await printer.selectOption(printerId)
  await page.evaluate(
    (id) =>
      window.barista.invoke('print:settingsWrite', {
        printerId: id,
        settings: {
          printMethod: 'electron',
          copies: 1,
          collate: true,
          monochrome: false,
          sizing: 'actual',
          customScale: 100,
          chooseLabelPaper: true,
          orientation: 'auto',
          offsetX: 0,
          offsetY: 0,
          paperWidthMm: 210,
          paperHeightMm: 297,
          marginMm: 0
        }
      }),
    printerId
  )
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
  }, output)
  await page.getByRole('button', { name: 'Print 3 labels' }).click()
  await page.getByText(/Job .* completed · \d{6}–\d{6}/).waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Reload', exact: true }).click()
  for (const key of ['EQ-001', 'EQ-002', 'EQ-003'])
    await page
      .getByRole('row')
      .filter({ hasText: key })
      .getByText('printed', { exact: true })
      .waitFor()
  await page.screenshot({ path: path.join(verification, 'print-station.png') })

  const secured = await page.evaluate(() =>
    window.barista.invoke('station:setAdminPin', { currentPin: '', newPin: '2468' })
  )
  if (!secured.ok) throw new Error(secured.error.message)
  await page.getByRole('button', { name: 'Open editor' }).click()
  await page.getByRole('textbox', { name: 'Admin PIN' }).fill('2468')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByText('Untitled', { exact: true }).first().waitFor()
  await page.evaluate(() =>
    window.barista.invoke('station:setAdminPin', { currentPin: '2468', newPin: null })
  )
  if (runtimeErrors.length) throw new Error(`Renderer emitted errors:\n${runtimeErrors.join('\n')}`)
  if ((await fs.stat(output)).size < 1000) throw new Error('The Station PDF is unexpectedly small.')
  console.log(
    'Verified --station routing, approved Excel template, clean preview, three-record PDF print/tracking and PIN-protected editor transition.'
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
