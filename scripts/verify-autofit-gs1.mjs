/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
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

  await page.getByRole('tab', { name: 'Variables' }).click()
  await page.getByLabel('Quick create variable').selectOption('serial')
  await page.getByRole('option', { name: /serial · counter/ }).waitFor()
  await page.getByRole('tab', { name: 'Properties' }).click()

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
  const clickLabel = async (fx = 0, fy = 0) => canvas.click({ position: await labelPoint(fx, fy) })
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await clickLabel(-0.3, -0.2)
  const text = page.getByRole('textbox', { name: 'Text content' })
  await text.fill('Industrial hydraulic equipment name that is intentionally far too long')
  await page.getByLabel('Width (mm)').fill('8')
  await page.getByLabel('Height (mm)').fill('3')
  await page.getByLabel('Font size (pt)').fill('18')
  await page.getByLabel('Fit mode').selectOption('shrink')
  await page.getByLabel('Minimum font size (pt)').fill('12')
  await page.getByLabel('Maximum lines').fill('1')
  await page.getByText(/Text still overflows at the 12 pt minimum/).waitFor()

  await page.getByRole('button', { name: 'Barcode', exact: true }).click()
  await clickLabel(0.1, 0.1)
  await page.getByRole('button', { name: 'GS1 Builder…' }).click()
  const builder = page.getByRole('dialog', { name: 'GS1 builder' })
  await builder.getByLabel('Value for 01').fill('0950110153000')
  await builder.getByRole('button', { name: 'Add AI' }).click()
  const aiInputs = builder.getByLabel('Application Identifier')
  await aiInputs.nth(1).fill('17')
  await builder.getByLabel('Value for 17').fill('251231')
  await builder.getByRole('button', { name: 'Add AI' }).click()
  await aiInputs.nth(2).fill('21')
  await builder.getByLabel('Value source for 21').selectOption('variable')
  await builder.getByLabel('Variable for 21').selectOption('serial')
  await builder.getByText('(01)09501101530003(17)251231(21)0001', { exact: true }).waitFor()
  await fs.mkdir('docs/verification/0.3.0', { recursive: true })
  await page.screenshot({ path: 'docs/verification/0.3.0/autofit-gs1.png' })
  await builder.getByRole('button', { name: 'Apply', exact: true }).click()
  await builder.waitFor({ state: 'hidden' })
  const symbology = page.getByLabel('Symbology')
  if ((await symbology.inputValue()) !== 'gs1-128')
    throw new Error(`Expected GS1-128, received ${await symbology.inputValue()}`)
  await page
    .getByRole('textbox', { name: 'Barcode data' })
    .locator('.variable-chip')
    .getByText('serial', { exact: true })
    .waitFor()
  const options = await symbology
    .locator('option:not([disabled])')
    .evaluateAll((nodes) => nodes.map((node) => node.value))
  if (options.length !== 11) throw new Error(`Expected 11 symbologies, received ${options.length}`)
  const barcodeData = page.getByRole('textbox', { name: 'Barcode data' })
  const beforeSymbologyChange = await barcodeData.innerText()
  await symbology.selectOption('codabar')
  await page
    .getByText(
      'Codabar data must be digits framed by an uppercase start and stop letter from A to D, for example A123456A'
    )
    .waitFor()
  if ((await barcodeData.innerText()) !== beforeSymbologyChange)
    throw new Error('Changing the symbology rewrote the barcode data')
  await symbology.selectOption('gs1-128')
  await barcodeData.fill('1234567890')
  await page
    .getByText(
      'GS1-128 data must be element strings starting with an application identifier in parentheses, for example (01)09501101530003'
    )
    .waitFor()
  await page.screenshot({ path: 'docs/verification/0.3.0/barcode-symbology-rules.png' })
  await page.getByRole('button', { name: 'Open GS1 Builder…' }).click()
  await builder.waitFor()
  await builder.getByRole('button', { name: 'Cancel', exact: true }).click()
  await builder.waitFor({ state: 'hidden' })

  // The Data Source section binds one variable as the object's whole value:
  // picking a counter must replace the barcode data, not append to it.
  await symbology.selectOption('code128')
  const dataSource = page.getByLabel('Object data source')
  const section = page.locator('.document-properties section').filter({ has: dataSource })
  await dataSource.waitFor()
  if ((await dataSource.inputValue()) !== 'fixed')
    throw new Error(`Literal barcode data was read as ${await dataSource.inputValue()}`)
  await section.screenshot({ path: 'docs/verification/0.3.0/data-source-fixed.png' })

  await dataSource.selectOption('counter')
  await page.getByLabel('Source variable').waitFor()
  if ((await barcodeData.innerText()) !== 'serial')
    throw new Error(`Binding a counter did not replace the data: ${await barcodeData.innerText()}`)
  if ((await barcodeData.locator('.variable-chip').count()) !== 1)
    throw new Error('Binding a counter left more than one token in the barcode data.')
  await page.getByText('Preview: 0001', { exact: true }).waitFor()
  await page.getByLabel('Counter prefix').fill('SN-')
  await page.getByText('Preview: SN-0001', { exact: true }).waitFor()
  await page.getByLabel('Counter prefix').fill('')
  await section.screenshot({ path: 'docs/verification/0.3.0/data-source-counter.png' })

  // A hand-written expression is reported as custom and left exactly as typed.
  await barcodeData.fill('SN-{serial}')
  await page.getByText('This value mixes text and variables.').waitFor()
  if ((await dataSource.inputValue()) !== 'custom')
    throw new Error(`A mixed expression was read as ${await dataSource.inputValue()}`)
  if ((await barcodeData.innerText()) !== 'SN-{serial}')
    throw new Error(`The custom expression was rewritten: ${await barcodeData.innerText()}`)
  await section.screenshot({ path: 'docs/verification/0.3.0/data-source-custom.png' })

  await dataSource.selectOption('field')
  await page.getByLabel('Spreadsheet column').fill('Asset')
  await page.getByLabel('Sample field value').fill('A-17')
  if ((await barcodeData.innerText()) !== 'Column')
    throw new Error(`Binding a field did not replace the data: ${await barcodeData.innerText()}`)
  await page.getByText('Preview: A-17', { exact: true }).waitFor()
  await section.screenshot({ path: 'docs/verification/0.3.0/data-source-field.png' })

  // Going back to fixed text unbinds, keeping the value that was on screen.
  await dataSource.selectOption('fixed')
  if ((await barcodeData.locator('.variable-chip').count()) !== 0)
    throw new Error('Fixed text left a variable chip in the barcode data.')
  if ((await barcodeData.innerText()) !== 'A-17')
    throw new Error(`Fixed text did not keep the resolved value: ${await barcodeData.innerText()}`)
  // The section collapses, and its header is the only control that survives.
  await page.getByRole('button', { name: 'Data source', exact: true }).click()
  if (await dataSource.isVisible()) throw new Error('The Data source section did not collapse.')
  await page.getByRole('button', { name: 'Data source', exact: true }).click()
  await dataSource.waitFor()

  // Text is fitted with the canvas the editor draws on, not with the shared glyph
  // approximation. Inter's "w" is 0.82 em, so ten of them are 28.9 mm at 10 pt and
  // overflow this 24 mm box; the approximation scores lowercase at 0.52 em, calls
  // the same line 18.3 mm and reports no overflow at all.
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await clickLabel(-0.3, 0.2)
  await page.getByRole('textbox', { name: 'Text content' }).fill('wwwwwwwwww')
  await page.getByLabel('Font family').selectOption('Inter')
  await page.getByLabel('Font size (pt)').fill('10')
  await page.getByLabel('Fit mode').selectOption('wrap')
  await page.getByLabel('X (mm)').fill('2')
  await page.getByLabel('Y (mm)').fill('24')
  await page.getByLabel('Width (mm)').fill('24')
  await page.getByLabel('Height (mm)').fill('10')
  await page.getByText('Text exceeds its box.').waitFor()

  if (runtimeErrors.length) throw new Error(`Renderer emitted errors:\n${runtimeErrors.join('\n')}`)
  console.log(
    'Verified text minimum/overflow indicators, canvas-measured text fitting, the GS1-128 ' +
      'builder with check digit, date and variable AI values, the eleven symbologies with ' +
      'their plain-language data rules, and the Data Source section binding a counter, a ' +
      'spreadsheet field and fixed text.'
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
