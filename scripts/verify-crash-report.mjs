/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global window */
import { _electron } from 'playwright-core'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { strFromU8, unzipSync } from 'fflate'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const userData = await mkdtemp(join(tmpdir(), 'barista-crash-report-'))
const launch = () =>
  _electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...env, BARISTA_SPLASH_MIN_MS: '0' }
  })
const close = async (instance) => {
  await instance.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await instance.close().catch(() => {})
}

const diagnosticsDir = join(userData, 'diagnostics')
await mkdir(diagnosticsDir, { recursive: true })
await writeFile(
  join(diagnosticsDir, 'pending-crash.json'),
  `${JSON.stringify({
    id: 'verification-crash',
    createdAt: new Date().toISOString(),
    event: 'renderer.gone',
    details: { reason: 'crashed', password: 'must-not-survive' }
  })}\n`
)

const app = await launch()
let reportPath = null
try {
  let page = app.windows().find((candidate) => !candidate.url().includes('splash'))
  if (!page)
    page = await app.waitForEvent('window', {
      predicate: (candidate) => !candidate.url().includes('splash')
    })
  await page.getByText('Barista closed unexpectedly.', { exact: true }).waitFor({ timeout: 60_000 })
  const notice = await page.evaluate(() => window.barista.invoke('diagnostics:crashNotice'))
  if (!notice) throw new Error('Crash notice did not expose the saved report.')
  reportPath = notice.path
  await page.getByRole('button', { name: 'View contents' }).click()
  await page.getByText(/database-info\.json/).waitFor()
  await page.waitForTimeout(250)
  await page.screenshot({ path: 'scratch/verification/0.4.0/crash-notice.png' })
  await page.getByRole('button', { name: 'Dismiss' }).click()
  const dismissed = await page.evaluate(() => window.barista.invoke('diagnostics:crashNotice'))
  if (dismissed) throw new Error('Dismissed crash notice would appear again.')

  const files = unzipSync(new Uint8Array(await readFile(reportPath)))
  const text = Object.entries(files)
    .filter(([name]) => !name.endsWith('.dmp'))
    .map(([, bytes]) => strFromU8(bytes))
    .join('\n')
  if (text.includes('must-not-survive')) throw new Error('Crash details were not redacted.')
  console.log(
    `Verified automatic crash report and one-time notice (${Object.keys(files).length} entries).`
  )
} finally {
  await close(app)
  await rm(join(diagnosticsDir, 'pending-crash.json'), { force: true })
  await rm(join(diagnosticsDir, 'crash-notice.json'), { force: true })
  if (reportPath) await rm(reportPath, { force: true })
  await rm(userData, { recursive: true, force: true })
}
