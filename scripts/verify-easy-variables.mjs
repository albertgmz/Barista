/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global document, DataTransfer, DragEvent */
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
  await page.getByLabel('Quick create variable').selectOption('operator')
  const operator = page.getByRole('option', { name: /operator · prompt/ })
  await operator.waitFor()
  const dragData = await operator.evaluate((source) => {
    const transfer = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
    if (!transfer.getData('application/x-barista-variable'))
      transfer.setData('application/x-barista-variable', 'operator')
    const canvas = document.querySelector('.canvas-container canvas.upper-canvas')
    if (!canvas) throw new Error('Canvas not found')
    const bounds = canvas.getBoundingClientRect()
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      dataTransfer: transfer
    }
    canvas.dispatchEvent(new DragEvent('dragover', event))
    canvas.dispatchEvent(new DragEvent('drop', event))
    return transfer.getData('application/x-barista-variable')
  })
  if (dragData !== 'operator') throw new Error('Variable drag payload was not populated.')

  const field = page.getByRole('textbox', { name: 'Text content' })
  await field.waitFor({ timeout: 5000 })
  await field.locator('.variable-chip').getByText('operator', { exact: true }).waitFor()

  await field.click()
  await page.keyboard.press('End')
  await page.keyboard.type('{')
  const autocomplete = page.getByRole('listbox', { name: 'Variable autocomplete' })
  await autocomplete.waitFor()
  const autocompleteBox = await autocomplete.boundingBox()
  if (!autocompleteBox || autocompleteBox.width < 300)
    throw new Error('Variable autocomplete does not retain a usable width in the side panel.')
  await autocomplete.getByRole('button').first().click()
  if ((await field.locator('.variable-chip').count()) !== 2)
    throw new Error('Brace autocomplete did not insert a second variable chip.')

  await page.getByRole('menuitem', { name: 'Object', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Bind to variable...', exact: true }).click()
  const binding = page.getByRole('dialog', { name: 'Bind to variable' })
  await binding.getByRole('button', { name: 'Bind', exact: true }).click()
  await binding.waitFor({ state: 'hidden' })
  await field.locator('.variable-chip').nth(2).waitFor()

  await page.getByLabel('Quick create variable').selectOption('today')
  await page.getByText('unused', { exact: true }).waitFor()
  await page.getByLabel('Quick create variable').evaluate((element) => {
    if (element.value !== '') throw new Error(`Quick create did not reset: ${element.value}`)
  })
  await page.getByLabel('Quick create variable').selectOption('excel')
  // Adding leaves the new variable collapsed, so its settings open on click.
  await page.getByRole('option', { name: /Column · field/ }).click()
  await page.getByLabel('Excel column', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Back to variables' }).click()
  await page.getByLabel('Excel column', { exact: true }).waitFor({ state: 'hidden' })
  await fs.mkdir('scratch/verification/0.3.0', { recursive: true })
  await page.screenshot({ path: 'scratch/verification/0.3.0/easy-variables.png' })

  // Moving an object must not write the canvas string back into the document:
  // the canvas carries wrapped lines, and with sample data on it carries
  // resolved values rather than the source expressions.
  const sourceText = await field.innerText()
  const chips = await field.locator('.variable-chip').count()
  const xField = page.getByLabel('X (mm)')
  const beforeX = await xField.inputValue()
  const sampleDataItem = async (expected) => {
    await page.getByRole('menuitem', { name: 'View', exact: true }).click()
    const item = page.getByRole('menuitemcheckbox', { name: 'Show Sample Data' })
    await item.waitFor()
    if ((await item.getAttribute('aria-checked')) !== expected)
      throw new Error(`Sample data was not ${expected === 'true' ? 'on' : 'off'}.`)
    return item
  }
  const toggleSampleData = async (expected) => {
    const item = await sampleDataItem(expected)
    await item.click()
    // The menu overlay would swallow the drag below, and the toggle rebuilds
    // the canvas asynchronously; both are done once the popup has gone.
    await item.waitFor({ state: 'hidden' })
  }
  // The view is carried between sessions now, so a run that left it off must
  // not decide what the next one sees; the canvas has to carry resolved values
  // before the drag below.
  await page.getByRole('menuitem', { name: 'View', exact: true }).click()
  const restore = page.getByRole('menuitemcheckbox', { name: 'Show Sample Data' })
  await restore.waitFor()
  if ((await restore.getAttribute('aria-checked')) !== 'true') await restore.click()
  else await page.keyboard.press('Escape')
  await restore.waitFor({ state: 'hidden' })
  const checked = await sampleDataItem('true')
  await page.keyboard.press('Escape')
  await checked.waitFor({ state: 'hidden' })
  const canvas = page.locator('.canvas-container canvas.upper-canvas')
  const canvasBox = await canvas.boundingBox()
  if (!canvasBox) throw new Error('Canvas has no bounding box.')
  const grabX = canvasBox.x + canvasBox.width / 2 + 20
  const grabY = canvasBox.y + canvasBox.height / 2 + 10
  await page.mouse.move(grabX, grabY)
  await page.mouse.down()
  await page.mouse.move(grabX + 30, grabY + 12, { steps: 8 })
  await page.mouse.up()
  await page.waitForFunction(
    (previous) =>
      document.querySelector('input[aria-label="X (mm)"]')?.value !== previous.value &&
      !!document.querySelector('input[aria-label="X (mm)"]')?.value,
    { value: beforeX }
  )
  if ((await field.innerText()) !== sourceText)
    throw new Error(
      `Dragging the object rewrote its text: ${sourceText} became ${await field.innerText()}`
    )
  if ((await field.locator('.variable-chip').count()) !== chips)
    throw new Error('Dragging the object dropped a variable chip.')

  // Inline editing round-trips the expression: entering an edit replaces the
  // resolved value on the canvas with the source text, and leaving it stores
  // what was typed rather than what was rendered.
  await canvas.dblclick({
    position: { x: grabX - canvasBox.x + 30, y: grabY - canvasBox.y + 12 }
  })
  const inlineEditor = page.locator('[data-fabric="textarea"]')
  await inlineEditor.waitFor({ state: 'attached' })
  const editing = await inlineEditor.inputValue()
  if (!editing.includes('{operator}'))
    throw new Error(`Inline editing did not show the source expression: ${editing}`)
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Lot {operator}')
  await page.keyboard.press('Escape')
  await inlineEditor.waitFor({ state: 'detached' })
  await page.waitForFunction(() => {
    const content = document.querySelector('[role="textbox"][aria-label="Text content"]')
    const chips = content?.querySelectorAll('.variable-chip')
    return (
      chips?.length === 1 &&
      chips[0].textContent === 'operator' &&
      content.innerText.includes('Lot')
    )
  })
  // A rebuild must commit an inline edit that is still open rather than discard
  // it: the View toggle tears the canvas down, and the commit that teardown
  // fires used to be suppressed as an internal sync.
  await canvas.dblclick({
    position: { x: grabX - canvasBox.x + 30, y: grabY - canvasBox.y + 12 }
  })
  await inlineEditor.waitFor({ state: 'attached' })
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Lot {operator} 7')
  await toggleSampleData('true')
  const survived = await page
    .waitForFunction(
      () => {
        const content = document.querySelector('[role="textbox"][aria-label="Text content"]')
        return content?.innerText.includes('Lot') && content.innerText.includes('7')
      },
      undefined,
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false)
  if (!survived) throw new Error('A rebuild during an inline edit discarded what was typed.')

  await field.click()
  await page.keyboard.press('End')
  await page.keyboard.type('{missing}')
  await page.keyboard.press('Escape')
  await page.getByText('Undefined: missing', { exact: true }).waitFor()

  // Leave the persisted view as this run found it, past the save debounce.
  await toggleSampleData('false')
  await page.waitForTimeout(500)

  if (runtimeErrors.length) throw new Error(`Renderer emitted errors:\n${runtimeErrors.join('\n')}`)
  console.log(
    'Verified variable drag/drop, chips, brace autocomplete, binding, quick create, usage diagnostics, the inline-edit expression round trip and an open edit surviving a rebuild.'
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
