/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { _electron } from 'playwright-core'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ args: ['.', '--verbose'], env: { ...env, BARISTA_SPLASH_MIN_MS: '0' } })
let generatedPath = null

try {
  let page = app.windows().find((candidate) => !candidate.url().includes('splash'))
  if (!page)
    page = await app.waitForEvent('window', {
      predicate: (candidate) => !candidate.url().includes('splash')
    })
  await page.getByText('Untitled', { exact: true }).first().waitFor()
  await page.getByRole('menuitem', { name: 'Help', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Create Diagnostic Report…' }).click()
  const report = page.getByRole('dialog', { name: 'Create Diagnostic Report' })
  await report.waitFor()
  await report.getByText(/never uploads or sends diagnostic information/i).waitFor()
  await page.screenshot({ path: 'docs/verification/0.4.0/diagnostic-report.png' })
  await report
    .getByLabel('What were you doing when the problem happened?')
    .fill('Automated local verification')
  await report.getByRole('button', { name: 'Create Report' }).click()
  await report.getByText(/Saved as Barista-diagnostic-/).waitFor({ timeout: 60_000 })
  await report.getByRole('button', { name: 'View contents' }).click()
  await report.getByText(/system-report\.json/).waitFor()
  await page.screenshot({ path: 'docs/verification/0.4.0/diagnostic-contents.png' })
  await report.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('menuitem', { name: 'Help', exact: true }).click()
  await page.getByRole('menuitem', { name: 'View Logs' }).click()
  const logs = page.getByRole('dialog', { name: 'Diagnostic Logs' })
  await logs.waitFor()
  await logs.getByText('app.start', { exact: true }).first().waitFor()
  await page.waitForTimeout(250)
  await page.screenshot({ path: 'docs/verification/0.4.0/log-viewer.png' })

  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  const diagnosticsDir = join(userData, 'diagnostics')
  const reports = (await readdir(diagnosticsDir))
    .filter((name) => /^Barista-diagnostic-.*\.zip$/.test(name))
    .sort()
  const latest = reports.at(-1)
  if (!latest) throw new Error('The diagnostic ZIP was not created.')
  generatedPath = join(diagnosticsDir, latest)
  const files = unzipSync(new Uint8Array(await readFile(generatedPath)))
  for (const required of [
    'summary.txt',
    'preferences.json',
    'workspace.json',
    'database-info.json',
    'system-report.json'
  ]) {
    if (!files[required]) throw new Error(`Diagnostic report is missing ${required}.`)
  }
  const text = Object.entries(files)
    .filter(([name]) => !name.endsWith('.dmp'))
    .map(([, bytes]) => strFromU8(bytes))
    .join('\n')
  const username = process.env.USERNAME
  if (username && text.toLocaleLowerCase().includes(`\\users\\${username.toLocaleLowerCase()}\\`))
    throw new Error('A Windows username path was not redacted.')
  console.log(`Verified local diagnostic UI and ${Object.keys(files).length} ZIP entries.`)
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
  if (generatedPath) await rm(generatedPath, { force: true })
}
