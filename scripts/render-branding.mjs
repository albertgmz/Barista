/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1
  })
  const svg = await readFile('build/logo.svg', 'utf8')
  await page.setContent(`<style>body{margin:0}svg{width:1024px;height:1024px}</style>${svg}`)
  await page.screenshot({ path: 'build/logo-original.png', omitBackground: true })
} finally {
  await browser.close()
}
