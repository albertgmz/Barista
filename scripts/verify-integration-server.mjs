/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/* global window */
import { _electron } from 'playwright-core'
import WebSocket from 'ws'
import { createServer } from 'node:net'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const port = await new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    server.close(() => resolve(address.port))
  })
})
const library = path.resolve('scratch/verification/0.3.0/station-library')
const barPath = path.join(library, 'approved-equipment.bar')
const output = path.resolve('scratch/verification/0.3.0/integration-curl-print.pdf')
const phpOutput = path.resolve('scratch/verification/0.3.0/integration-php-print.pdf')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ args: ['.'], env: { ...env, BARISTA_SPLASH_MIN_MS: '0' } })
try {
  let page = app.windows().find((candidate) => !candidate.url().includes('splash'))
  if (!page)
    page = await app.waitForEvent('window', {
      predicate: (candidate) => !candidate.url().includes('splash')
    })
  await page.getByText('Untitled', { exact: true }).first().waitFor()
  const setup = await page.evaluate(
    async ({ library, port }) => {
      const prior = await window.barista.invoke('integration:status')
      if (prior.ok)
        for (const item of prior.value.tokens)
          if (item.name.startsWith('verification-'))
            await window.barista.invoke('integration:revokeToken', { id: item.id })
      await window.barista.invoke('library:setFolders', { folders: [library] })
      await window.barista.invoke('library:index')
      const read = await window.barista.invoke('integration:createToken', {
        name: 'verification-read',
        scopes: ['read']
      })
      const all = await window.barista.invoke('integration:createToken', {
        name: 'verification-all',
        scopes: ['read', 'preview', 'print']
      })
      const saved = await window.barista.invoke('integration:save', {
        enabled: true,
        port,
        bindAddress: '127.0.0.1',
        allowLan: false,
        allowedOrigins: ['https://allowed.example'],
        startWithWindows: false
      })
      return { read, all, saved }
    },
    { library, port }
  )
  if (!setup.read.ok || !setup.all.ok || !setup.saved.ok)
    throw new Error('Could not configure integration server.')
  const actualPort = setup.saved.value.actualPort
  const root = `http://127.0.0.1:${actualPort}`
  const readToken = setup.read.value.token,
    token = setup.all.value.token
  const call = (url, bearer, options = {}) =>
    fetch(`${root}${url}`, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {})
      }
    })
  if ((await call('/v1/status', '')).status !== 401)
    throw new Error('Unauthenticated status did not return 401.')
  const securedStatus = await call('/v1/status', readToken)
  if (securedStatus.status !== 200) throw new Error('Read token could not read status.')
  if (
    securedStatus.headers.get('x-content-type-options') !== 'nosniff' ||
    securedStatus.headers.get('x-frame-options') !== 'DENY' ||
    securedStatus.headers.get('cache-control') !== 'no-store'
  )
    throw new Error('Integration security headers are incomplete.')
  if (
    (await call('/v1/status', readToken, { headers: { origin: 'https://evil.example' } }))
      .status !== 403
  )
    throw new Error('Disallowed origin was accepted.')
  const preflight = await call('/v1/status', '', {
    method: 'OPTIONS',
    headers: { origin: 'https://allowed.example', 'access-control-request-private-network': 'true' }
  })
  if (
    preflight.status !== 204 ||
    preflight.headers.get('access-control-allow-private-network') !== 'true'
  )
    throw new Error('Private Network Access preflight failed.')
  const templates = await (await call('/v1/templates', readToken)).json()
  const template = templates.find((item) => item.title === 'Approved Equipment Label')
  if (!template) throw new Error('Approved template was not returned.')
  const denied = await call('/v1/preview', readToken, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ templateId: template.id })
  })
  if (denied.status !== 401) throw new Error('Read-only token was allowed to preview.')
  const preview = await call('/v1/preview', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ templateId: template.id })
  })
  if (
    preview.status !== 200 ||
    preview.headers.get('content-type') !== 'image/png' ||
    (await preview.arrayBuffer()).byteLength < 100
  )
    throw new Error('Library preview failed.')
  const form = new FormData()
  form.append('file', new Blob([await fs.readFile(barPath)]), 'approved-equipment.bar')
  form.append('options', JSON.stringify({ format: 'pdf' }))
  const uploaded = await call('/v1/preview/bar', token, { method: 'POST', body: form })
  if (uploaded.status !== 200 || uploaded.headers.get('content-type') !== 'application/pdf')
    throw new Error(`Multipart preview failed: ${uploaded.status} ${await uploaded.text()}`)
  const websocket = new WebSocket(`ws://127.0.0.1:${actualPort}/v1/events`, [
    'barista-v1',
    `barista-token.${readToken}`
  ])
  await new Promise((resolve, reject) => {
    websocket.once('message', (data) =>
      JSON.parse(String(data)).type === 'ready'
        ? resolve()
        : reject(new Error('Unexpected WebSocket greeting.'))
    )
    websocket.once('error', reject)
  })
  websocket.close()
  const printerResponse = await call('/v1/printers', readToken)
  if (printerResponse.status !== 200)
    throw new Error(`Read token could not list printers: ${printerResponse.status}`)
  const printers = await printerResponse.json()
  const pdf = printers.find((printer) => printer.name === 'Microsoft Print to PDF')
  if (pdf) {
    await fs.rm(output, { force: true })
    await fs.rm(phpOutput, { force: true })
    await app.evaluate(
      ({ dialog }, targets) => {
        const remaining = [...targets]
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: remaining.shift() })
      },
      [output, phpOutput]
    )
    const waitForJob = async (jobId) => {
      let job
      for (let index = 0; index < 100; index++) {
        job = await (await call(`/v1/jobs/${jobId}`, readToken)).json()
        if (job.state === 'done' || job.state === 'failed') break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      if (job?.state !== 'done')
        throw new Error(`PDF integration print failed: ${job?.error ?? job?.state}`)
    }
    const curl = spawnSync(
      'curl.exe',
      [
        '--silent',
        '--show-error',
        '--fail-with-body',
        '-H',
        `Authorization: Bearer ${token}`,
        '-F',
        `file=@${barPath};type=application/octet-stream`,
        '-F',
        `options=${JSON.stringify({ printer: pdf.id })};type=application/json`,
        `${root}/v1/print/bar`
      ],
      { encoding: 'utf8' }
    )
    if (curl.status !== 0) throw new Error(`curl print failed: ${curl.stderr || curl.stdout}`)
    await waitForJob(JSON.parse(curl.stdout).jobId)

    const encoded = (value) => Buffer.from(value).toString('base64')
    const phpCode = `$url=base64_decode('${encoded(`${root}/v1/print/bar`)}');$token=base64_decode('${encoded(token)}');$file=base64_decode('${encoded(barPath)}');$printer=base64_decode('${encoded(pdf.id)}');$c=curl_init($url);curl_setopt_array($c,[CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$token],CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>['file'=>new CURLFile($file,'application/octet-stream'),'options'=>json_encode(['printer'=>$printer])],CURLOPT_RETURNTRANSFER=>true]);$r=curl_exec($c);if($r===false){fwrite(STDERR,curl_error($c));exit(1);}echo $r;`
    const php = spawnSync('php.exe', ['-r', phpCode], { encoding: 'utf8' })
    if (php.status !== 0) throw new Error(`PHP print failed: ${php.stderr || php.stdout}`)
    await waitForJob(JSON.parse(php.stdout).jobId)
    if ((await fs.stat(output)).size < 1000 || (await fs.stat(phpOutput)).size < 1000)
      throw new Error('A curl/PHP PDF integration result is unexpectedly small.')
  }
  await page.keyboard.press('Control+,')
  const preferences = page.getByRole('dialog', { name: 'Preferences' })
  await preferences.getByRole('tab', { name: 'Integration' }).click()
  await preferences
    .getByText(/verification-all/)
    .first()
    .waitFor()
  await page.screenshot({ path: 'scratch/verification/0.3.0/integration-server.png' })
  await preferences.getByRole('button', { name: 'Close' }).click()
  await page.evaluate(
    async ({ readId, allId }) => {
      await window.barista.invoke('integration:save', {
        enabled: false,
        port: 17777,
        bindAddress: '127.0.0.1',
        allowLan: false,
        allowedOrigins: [],
        startWithWindows: false
      })
      await window.barista.invoke('integration:revokeToken', { id: readId })
      await window.barista.invoke('integration:revokeToken', { id: allId })
    },
    { readId: setup.read.value.summary.id, allId: setup.all.value.summary.id }
  )
  console.log(
    `Verified random-port auth, scopes, CORS/PNA, library and uploaded previews, WebSocket events${pdf ? ', and /v1/print/bar to Microsoft Print to PDF through curl and PHP' : '; Print to PDF unavailable and skipped'}.`
  )
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
  )
  await app.close().catch(() => {})
}
