/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global document, devicePixelRatio, HTMLCanvasElement, HTMLElement */
import { _electron } from 'playwright-core'
import * as fs from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const openedFile = process.argv[2] ? resolve(process.argv[2]) : null
const app = await _electron.launch({
  args: openedFile ? ['.', openedFile] : ['.'],
  env: { ...env, BARISTA_SPLASH_MIN_MS: '0' }
})

async function mainWindow() {
  let page = app.windows().find((candidate) => !candidate.url().includes('splash'))
  if (!page)
    page = await app.waitForEvent('window', {
      predicate: (candidate) => !candidate.url().includes('splash')
    })
  await page.locator('[data-canvas-width]').waitFor()
  await page.waitForFunction(
    () => Number(document.querySelector('[data-canvas-width]')?.dataset.canvasWidth) > 0
  )
  if (openedFile) await page.getByText(basename(openedFile), { exact: true }).first().waitFor()
  return page
}

async function metrics(page) {
  return page.locator('[data-canvas-width]').evaluate((host) => {
    const canvas = host.querySelector('canvas.lower-canvas')
    const upper = host.querySelector('canvas.upper-canvas')
    const cssWidth = Number(host.dataset.canvasWidth)
    const cssHeight = Number(host.dataset.canvasHeight)
    const lowerBounds = canvas?.getBoundingClientRect()
    const upperBounds = upper?.getBoundingClientRect()
    const canvases = [...host.querySelectorAll('canvas')].map((item) => ({
      width: item.width,
      height: item.height,
      cssWidth: item.getBoundingClientRect().width,
      cssHeight: item.getBoundingClientRect().height
    }))
    let whiteBounds = null
    if (canvas instanceof HTMLCanvasElement) {
      const context = canvas.getContext('2d')
      const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data
      if (pixels) {
        let left = canvas.width
        let top = canvas.height
        let right = -1
        let bottom = -1
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const index = (y * canvas.width + x) * 4
            if (pixels[index] > 245 && pixels[index + 1] > 245 && pixels[index + 2] > 245) {
              left = Math.min(left, x)
              top = Math.min(top, y)
              right = Math.max(right, x)
              bottom = Math.max(bottom, y)
            }
          }
        }
        if (right >= 0) whiteBounds = { left, top, right, bottom }
      }
    }
    return {
      width: cssWidth,
      height: cssHeight,
      originX: Number(host.dataset.labelOriginX),
      originY: Number(host.dataset.labelOriginY),
      pxPerMm: Number(host.dataset.pixelsPerMm),
      devicePixelRatio,
      backingRatio: canvas instanceof HTMLCanvasElement ? canvas.width / cssWidth : 0,
      lowerCssWidth: lowerBounds?.width ?? 0,
      lowerCssHeight: lowerBounds?.height ?? 0,
      upperCssWidth: upperBounds?.width ?? 0,
      upperCssHeight: upperBounds?.height ?? 0,
      canvases,
      wrapperCount: host.querySelectorAll('.canvas-container').length,
      whiteBounds
    }
  })
}

function assertCentered(viewport, widthMm, heightMm, label) {
  const expectedX = (viewport.width - widthMm * viewport.pxPerMm) / 2
  const expectedY = (viewport.height - heightMm * viewport.pxPerMm) / 2
  if (Math.abs(viewport.originX - expectedX) > 1 || Math.abs(viewport.originY - expectedY) > 1)
    throw new Error(
      `${label} is not centered: ${JSON.stringify({ viewport, expectedX, expectedY })}`
    )
}

function assertRenderedStock(viewport, widthMm, heightMm) {
  const bounds = viewport.whiteBounds
  if (!bounds) throw new Error('The rendered stock has no white pixels.')
  const expected = {
    left: viewport.originX,
    top: viewport.originY,
    right: viewport.originX + widthMm * viewport.pxPerMm,
    bottom: viewport.originY + heightMm * viewport.pxPerMm
  }
  if (
    Math.abs(bounds.left - expected.left) > 5 ||
    Math.abs(bounds.top - expected.top) > 5 ||
    Math.abs(bounds.right - expected.right) > 5 ||
    Math.abs(bounds.bottom - expected.bottom) > 5
  )
    throw new Error(
      `Rendered stock does not match the centered viewport: ${JSON.stringify({ bounds, expected })}`
    )
}

function assertDpiAware(viewport, label) {
  if (Math.abs(viewport.backingRatio - viewport.devicePixelRatio) > 0.02)
    throw new Error(`${label} backing store is not DPI-aware: ${JSON.stringify(viewport)}`)
}

function panOffset(viewport, widthMm, heightMm) {
  return {
    x: viewport.originX - (viewport.width - widthMm * viewport.pxPerMm) / 2,
    y: viewport.originY - (viewport.height - heightMm * viewport.pxPerMm) / 2
  }
}

async function waitCentered(page, widthMm, heightMm, label) {
  await page.waitForFunction(
    ({ widthMm, heightMm }) => {
      const host = document.querySelector('[data-canvas-width]')
      if (!(host instanceof HTMLElement)) return false
      const width = Number(host.dataset.canvasWidth)
      const height = Number(host.dataset.canvasHeight)
      const x = Number(host.dataset.labelOriginX)
      const y = Number(host.dataset.labelOriginY)
      const pxPerMm = Number(host.dataset.pixelsPerMm)
      return (
        Math.abs(x - (width - widthMm * pxPerMm) / 2) <= 1 &&
        Math.abs(y - (height - heightMm * pxPerMm) / 2) <= 1
      )
    },
    { widthMm, heightMm }
  )
  await page.waitForTimeout(250)
  const viewport = await metrics(page)
  assertCentered(viewport, widthMm, heightMm, label)
  return viewport
}

async function setLabelSize(page, widthMm, heightMm) {
  await page.getByRole('menuitem', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Label Setup...', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Label Setup' })
  await dialog.waitFor()
  await dialog.getByLabel(/^Width/).fill(String(widthMm))
  await dialog.getByLabel(/^Height/).fill(String(heightMm))
  await dialog.getByRole('button', { name: 'OK' }).click()
  await dialog.waitFor({ state: 'hidden' })
  return waitCentered(page, widthMm, heightMm, `Label Setup ${widthMm}×${heightMm}`)
}

try {
  const page = await mainWindow()
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  const cold = await waitCentered(page, 60, 35, 'cold start')
  assertRenderedStock(cold, 60, 35)
  const coldZoom = cold.pxPerMm
  assertDpiAware(cold, 'Cold-start Fabric')
  if (
    Math.abs(cold.lowerCssWidth - cold.width) > 1 ||
    Math.abs(cold.lowerCssHeight - cold.height) > 1 ||
    Math.abs(cold.upperCssWidth - cold.width) > 1 ||
    Math.abs(cold.upperCssHeight - cold.height) > 1
  )
    throw new Error(`Fabric layers do not fill the CSS viewport: ${JSON.stringify(cold)}`)
  if (cold.wrapperCount !== 1 || cold.canvases.length !== 2)
    throw new Error(`Fabric canvas mounted more than once: ${JSON.stringify(cold)}`)

  await fs.mkdir('scratch/verification/0.4.0', { recursive: true })
  await page.screenshot({ path: 'scratch/verification/0.4.0/canvas-centering-after.png' })

  await page.keyboard.press('Control+n')
  const newDialog = page.getByRole('dialog', { name: 'New Label' })
  await newDialog.waitFor()
  await newDialog.getByRole('button', { name: /60 × 35 mm/ }).click()
  await newDialog.getByRole('button', { name: 'Create' }).click()
  await newDialog.waitFor({ state: 'hidden' })
  await waitCentered(page, 60, 35, 'File New')
  if (openedFile) {
    await app.evaluate(({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()
        .find((candidate) => candidate.isVisible())
        ?.webContents.send('document:open', path)
    }, openedFile)
    await page.getByText(basename(openedFile), { exact: true }).first().waitFor()
    const opened = await waitCentered(page, 60, 35, 'File Open')
    assertRenderedStock(opened, 60, 35)
  }

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.isVisible())
    window?.setSize(1100, 720)
  })
  const resized = await waitCentered(page, 60, 35, 'window resize')
  if (Math.abs(resized.pxPerMm - coldZoom) > 0.001) throw new Error('Resize changed user zoom.')

  const hostBounds = await page.locator('[data-canvas-width]').boundingBox()
  if (!hostBounds) throw new Error('Canvas viewport has no bounds.')
  await page.mouse.move(hostBounds.x + hostBounds.width / 2, hostBounds.y + hostBounds.height / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(
    hostBounds.x + hostBounds.width / 2 + 50,
    hostBounds.y + hostBounds.height / 2 + 35
  )
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(100)
  const panned = await metrics(page)
  const pannedOffset = panOffset(panned, 60, 35)
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.isVisible())
    window?.setSize(1200, 760)
  })
  await page.waitForFunction(
    (previousWidth) =>
      Number(document.querySelector('[data-canvas-width]')?.dataset.canvasWidth) !== previousWidth,
    panned.width
  )
  await page.waitForTimeout(250)
  const pannedResize = await metrics(page)
  const preservedOffset = panOffset(pannedResize, 60, 35)
  if (
    Math.abs(preservedOffset.x - pannedOffset.x) > 1 ||
    Math.abs(preservedOffset.y - pannedOffset.y) > 1 ||
    Math.abs(pannedResize.pxPerMm - panned.pxPerMm) > 0.001
  )
    throw new Error('Window resize did not preserve the user pan and zoom.')
  await page.keyboard.press('Control+0')
  const fitAfterPan = await waitCentered(page, 60, 35, 'Fit after user pan')
  const layoutZoom = fitAfterPan.pxPerMm

  const displays = await app.evaluate(({ screen }) =>
    screen.getAllDisplays().map((display) => ({
      id: display.id,
      workArea: display.workArea
    }))
  )
  for (const display of displays) {
    await app.evaluate(({ BrowserWindow }, workArea) => {
      BrowserWindow.getAllWindows()
        .find((candidate) => candidate.isVisible())
        ?.setBounds({
          x: workArea.x + 20,
          y: workArea.y + 20,
          width: Math.min(1100, workArea.width - 40),
          height: Math.min(720, workArea.height - 40)
        })
    }, display.workArea)
    assertDpiAware(
      await waitCentered(page, 60, 35, `display ${display.id}`),
      `Display ${display.id}`
    )
  }

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.isVisible())
    window?.maximize()
  })
  await waitCentered(page, 60, 35, 'maximize')
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.isVisible())
    window?.unmaximize()
  })
  await waitCentered(page, 60, 35, 'restore')

  for (const panel of ['Properties', 'Layers', 'Variables', 'Assets', 'Preflight']) {
    await page.getByRole('menuitem', { name: 'Window', exact: true }).click()
    await page.getByRole('menuitemcheckbox', { name: panel, exact: true }).click()
  }
  const hiddenPanels = await waitCentered(page, 60, 35, 'hidden panels')
  if (Math.abs(hiddenPanels.pxPerMm - layoutZoom) > 0.001)
    throw new Error('Hiding panels changed user zoom.')

  const toolsGrip = page.getByRole('button', { name: 'Move Tools panel' })
  await toolsGrip.click({ button: 'right' })
  await page.getByRole('menuitemcheckbox', { name: 'Float Tools', exact: true }).click()
  const floating = await waitCentered(page, 60, 35, 'floating tools')
  if (Math.abs(floating.pxPerMm - layoutZoom) > 0.001)
    throw new Error('Floating tools changed user zoom.')
  await toolsGrip.click({ button: 'right' })
  await page.getByRole('menuitemcheckbox', { name: 'Dock Left', exact: true }).click()
  await waitCentered(page, 60, 35, 're-docked tools')

  await page.keyboard.press('Control+0')
  await waitCentered(page, 60, 35, 'Fit to Window')
  await page.keyboard.press('Control+1')
  const actual = await waitCentered(page, 60, 35, 'Actual Size')
  if (Math.abs(actual.pxPerMm - 96 / 25.4) > 0.01)
    throw new Error(`Actual Size did not use 96 DPI: ${JSON.stringify(actual)}`)

  const small = await setLabelSize(page, 25, 10)
  if (small.pxPerMm / (96 / 25.4) > 8.001) throw new Error('Small-label fit exceeded 800%.')
  await setLabelSize(page, 100, 150)

  if (runtimeErrors.length) throw new Error(`Renderer emitted errors:\n${runtimeErrors.join('\n')}`)
  console.log(
    'Verified centered canvas, rendered stock, File New/Open, resize preservation, fit/actual size, DPI, panels, tools, and label sizes.'
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
