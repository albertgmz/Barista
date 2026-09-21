/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global document, HTMLInputElement */
import { _electron } from 'playwright-core'

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
  const host = page.locator('[data-canvas-width]')
  await host.waitFor()
  await page.waitForFunction(
    () => Number(document.querySelector('[data-canvas-width]')?.dataset.canvasWidth) > 0
  )

  const keepInside = page.getByRole('button', { name: 'Keep inside label' })
  await keepInside.waitFor()
  // The setting rides along with the stored workspace, so start from a known
  // state instead of inheriting whatever the last run left behind.
  if ((await keepInside.getAttribute('aria-pressed')) === 'true') await keepInside.click()
  if ((await keepInside.getAttribute('aria-pressed')) === 'true')
    throw new Error('Keep inside label could not be switched off.')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  const box = await host.boundingBox()
  const origin = await host.evaluate((element) => ({
    x: Number(element.dataset.labelOriginX),
    y: Number(element.dataset.labelOriginY),
    pixelsPerMm: Number(element.dataset.pixelsPerMm)
  }))
  if (!box) throw new Error('Canvas has no visible bounds.')
  await page.mouse.click(
    box.x + origin.x + 8 * origin.pixelsPerMm,
    box.y + origin.y + 8 * origin.pixelsPerMm
  )

  const text = page.getByLabel('Text content')
  await text.waitFor()
  await text.fill('Color label')
  const currentBox = await host.boundingBox()
  const currentOrigin = await host.evaluate((element) => ({
    x: Number(element.dataset.labelOriginX),
    y: Number(element.dataset.labelOriginY),
    pixelsPerMm: Number(element.dataset.pixelsPerMm)
  }))
  const currentObject = await page.evaluate(() => ({
    x: Number(document.querySelector('input[aria-label="X (mm)"]')?.value),
    y: Number(document.querySelector('input[aria-label="Y (mm)"]')?.value),
    width: Number(document.querySelector('input[aria-label="Width (mm)"]')?.value),
    height: Number(document.querySelector('input[aria-label="Height (mm)"]')?.value)
  }))
  if (!currentBox) throw new Error('Canvas has no visible bounds after creating text.')
  await page.mouse.click(
    currentBox.x + currentOrigin.x + (currentObject.x + currentObject.width / 2) * currentOrigin.pixelsPerMm,
    currentBox.y + currentOrigin.y + (currentObject.y + currentObject.height / 2) * currentOrigin.pixelsPerMm,
    { button: 'right' }
  )
  await page
    .getByRole('menuitem', { name: 'Bind to variable...', exact: true })
    .waitFor({ timeout: 5000 })
  await page.keyboard.press('Escape')
  const color = page.getByLabel('Text color picker')
  await color.fill('#336699')
  if ((await color.inputValue()).toLocaleLowerCase() !== '#336699')
    throw new Error('Text color did not update.')

  const x = page.getByLabel('X (mm)')
  await x.fill('-5')
  await x.press('Enter')
  await keepInside.click()
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="X (mm)"]')
    return input instanceof HTMLInputElement && Number(input.value) >= 0
  })
  if ((await keepInside.getAttribute('aria-pressed')) !== 'true')
    throw new Error('Keep inside label did not remain enabled.')

  // Switching the toggle on tidies the design once. Prove the setting also holds
  // afterwards, which is the part that makes it worth having.
  const status = await page.locator('.app-layout > footer').innerText()
  const size = status.match(/(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*mm/)
  if (!size) throw new Error(`Could not read the label size from the status bar: ${status}`)
  const stock = { widthMm: Number(size[1]), heightMm: Number(size[2]) }

  const geometry = () =>
    page.evaluate(() => {
      const read = (label) => {
        const input = document.querySelector(`input[aria-label="${label}"]`)
        return input instanceof HTMLInputElement ? Number(input.value) : NaN
      }
      return {
        x: read('X (mm)'),
        y: read('Y (mm)'),
        width: read('Width (mm)'),
        height: read('Height (mm)')
      }
    })

  const y = page.getByLabel('Y (mm)')
  await y.fill('-9')
  await y.press('Enter')
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Y (mm)"]')
    return input instanceof HTMLInputElement && input.value !== '-9'
  })
  const abovePulledBack = await geometry()
  if (!(abovePulledBack.y >= -0.01))
    throw new Error(`Object above the label was not pulled back: y=${abovePulledBack.y}`)

  await x.fill(String(stock.widthMm + 20))
  await x.press('Enter')
  await page.waitForFunction((limit) => {
    const input = document.querySelector('input[aria-label="X (mm)"]')
    return input instanceof HTMLInputElement && Number(input.value) < limit
  }, stock.widthMm + 20)
  const rightPulledBack = await geometry()
  if (
    !(rightPulledBack.x >= -0.01) ||
    !(rightPulledBack.x + rightPulledBack.width <= stock.widthMm + 0.01)
  )
    throw new Error(
      `Object right of the label was not pulled back: x=${rightPulledBack.x} width=${rightPulledBack.width} stock=${stock.widthMm}`
    )

  // Leave the stored workspace as it was found.
  await keepInside.click()
  if ((await keepInside.getAttribute('aria-pressed')) === 'true')
    throw new Error('Keep inside label could not be switched off again.')

  console.log(
    'Verified text editing, the object context menu, arbitrary color, and that Keep inside label pulls objects back into the stock.'
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
