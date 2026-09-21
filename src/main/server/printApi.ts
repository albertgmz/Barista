/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { app } from 'electron'
import busboy from 'busboy'
import { WebSocketServer, WebSocket } from 'ws'
import { z } from 'zod'
import { decodeArchive } from '@main/storage/archive'
import { DriverPrinter } from '@main/printing/driver'
import { renderPdf, renderPng } from '@main/printing/renderWindow'
import { submitPrintRequest } from '@main/ipc/printIpc'
import { readLibraryTemplate, listLibrary } from '@main/station/library'
import { dataRepositories } from '@main/data'
import { DEFAULT_PRINT_SETTINGS } from '@shared/printSettings'
import { batchPreflight, preflight } from '@shared/preflight'
import { counterValue, evaluatedDocument } from '@shared/variables'
import type { PrintJobRequest } from '@shared/ipc/contract'
import type {
  IntegrationConfiguration,
  IntegrationScope,
  IntegrationTokenSummary
} from '@shared/integration'
import {
  appendIntegrationAudit,
  authenticateIntegrationToken,
  readIntegrationConfiguration
} from './config'
import { SettingsStoreFile } from '@main/storage/settings'
import { diagnosticLog } from '@main/diagnostics'

const MAX_JSON = 1_000_000,
  MAX_BAR = 25_000_000,
  RATE_LIMIT = 120
const requestSchema = z.object({
  templateId: z.string().length(32).optional(),
  values: z.record(z.string(), z.string().max(100_000)).default({}),
  records: z
    .array(
      z.object({
        dataSourceId: z.string().min(1).max(512),
        key: z.string().min(1).max(4096),
        rowHash: z.string().regex(/^[a-f0-9]{64}$/),
        fields: z.record(z.string(), z.string().max(100_000))
      })
    )
    .max(100_000)
    .optional(),
  printer: z.string().max(2048).optional(),
  copies: z.number().int().min(1).max(9999).default(1),
  serializedCount: z.number().int().min(1).max(100_000).default(1),
  format: z.enum(['png', 'pdf']).default('png')
})
interface ApiJob {
  id: string
  state: 'queued' | 'printing' | 'done' | 'failed'
  result?: unknown
  error?: string
}
function json(res: ServerResponse, status: number, value: unknown): void {
  const data = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data)
  })
  res.end(data)
}
async function body(req: IncomingMessage, limit = MAX_JSON): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk)
    size += bytes.length
    if (size > limit) throw new Error('Request body is too large.')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}
async function multipart(req: IncomingMessage): Promise<{ archive: Buffer; options: unknown }> {
  return new Promise((resolve, reject) => {
    let archive = Buffer.alloc(0),
      options: unknown,
      failure: Error | null = null,
      parser: ReturnType<typeof busboy>
    try {
      parser = busboy({
        headers: req.headers,
        preservePath: false,
        limits: {
          fileSize: MAX_BAR,
          files: 1,
          fields: 1,
          parts: 3,
          fieldSize: MAX_JSON,
          headerPairs: 50
        }
      })
    } catch (error) {
      reject(error)
      return
    }
    parser.on('file', (name, stream, info) => {
      if (name !== 'file' || !/\.bar$/i.test(info.filename))
        failure = new Error('The file part must be a .bar file named “file”.')
      const chunks: Buffer[] = []
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      stream.on('limit', () => {
        failure = new Error('Uploaded .bar file exceeds 25 MB.')
      })
      stream.on('end', () => {
        archive = Buffer.concat(chunks)
      })
    })
    parser.on('field', (name, value, info) => {
      if (name !== 'options' || info.valueTruncated)
        failure = new Error('The JSON part must be named “options”.')
      else
        try {
          options = JSON.parse(value)
        } catch {
          failure = new Error('The options part is not valid JSON.')
        }
    })
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const)
      parser.on(event, () => {
        failure = new Error('Multipart limits exceeded.')
      })
    parser.on('error', reject)
    parser.on('close', () =>
      failure
        ? reject(failure)
        : archive.length && options
          ? resolve({ archive, options })
          : reject(new Error('Both file and options parts are required.'))
    )
    req.pipe(parser)
  })
}
export class PrintApiServer {
  private server: Server | null = null
  private sockets = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 16_384,
    // The browser-compatible token subprotocol authenticates the upgrade only. Do not echo the
    // secret-bearing value in the handshake response.
    handleProtocols: (protocols) => (protocols.has('barista-v1') ? 'barista-v1' : false)
  })
  private jobs = new Map<string, ApiJob>()
  private clients = new Set<WebSocket>()
  private rates = new Map<string, { minute: number; count: number }>()
  actualPort: number | null = null
  get isRunning(): boolean {
    return !!this.server?.listening
  }
  async start(configuration?: IntegrationConfiguration): Promise<number> {
    const config = configuration ?? (await readIntegrationConfiguration())
    await this.stop()
    const server = createServer(
      {
        maxHeaderSize: 16_384,
        requestTimeout: 30_000,
        headersTimeout: 10_000,
        keepAliveTimeout: 5_000
      },
      (req, res) => {
        const startedAt = performance.now()
        res.once('finish', () =>
          diagnosticLog.info('server.request', {
            method: req.method ?? 'UNKNOWN',
            path: new URL(req.url ?? '/', 'http://localhost').pathname,
            status: res.statusCode,
            durationMs: Math.round(performance.now() - startedAt)
          })
        )
        void this.route(config, req, res)
      }
    )
    server.maxHeadersCount = 50
    server.on('upgrade', (req, socket, head) => void this.upgrade(config, req, socket, head))
    this.server = server
    const listen = (port: number) =>
      new Promise<number>((resolve, reject) => {
        const error = (caught: NodeJS.ErrnoException): void => {
          server.off('listening', ready)
          reject(caught)
        }
        const ready = (): void => {
          server.off('error', error)
          const address = server.address()
          resolve(typeof address === 'object' && address ? address.port : port)
        }
        server.once('error', error)
        server.once('listening', ready)
        server.listen(port, config.bindAddress)
      })
    try {
      this.actualPort = await listen(config.port)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      this.actualPort = await listen(0)
    }
    return this.actualPort
  }
  async stop(): Promise<void> {
    for (const client of this.clients) client.close(1001, 'Server stopping')
    this.clients.clear()
    const server = this.server
    this.server = null
    this.actualPort = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  private origin(
    config: IntegrationConfiguration,
    req: IncomingMessage,
    res: ServerResponse
  ): boolean {
    const origin = req.headers.origin
    if (origin && !config.allowedOrigins.includes(origin)) {
      json(res, 403, { error: 'Origin is not allowed.' })
      return false
    }
    if (origin) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'Origin')
    }
    return true
  }
  private rate(req: IncomingMessage): boolean {
    const key = req.socket.remoteAddress ?? 'unknown',
      minute = Math.floor(Date.now() / 60_000),
      old = this.rates.get(key),
      next = !old || old.minute !== minute ? { minute, count: 1 } : { minute, count: old.count + 1 }
    this.rates.set(key, next)
    if (this.rates.size > 10_000)
      for (const [address, value] of this.rates)
        if (value.minute !== minute) this.rates.delete(address)
    return next.count <= RATE_LIMIT
  }
  private async auth(
    req: IncomingMessage,
    scope: IntegrationScope
  ): Promise<IntegrationTokenSummary | null> {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')
    return match ? authenticateIntegrationToken(match[1]!, scope) : null
  }
  private async route(
    config: IntegrationConfiguration,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const endpoint = new URL(req.url ?? '/', 'http://localhost').pathname
    let token: IntegrationTokenSummary | null = null,
      outcome = 'failed'
    try {
      res.setHeader('cache-control', 'no-store')
      res.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
      res.setHeader('x-content-type-options', 'nosniff')
      res.setHeader('x-frame-options', 'DENY')
      res.setHeader('referrer-policy', 'no-referrer')
      if (!this.origin(config, req, res)) return
      if (!this.rate(req)) return json(res, 429, { error: 'Rate limit exceeded.' })
      if (req.method === 'OPTIONS') {
        res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
        res.setHeader('access-control-allow-headers', 'Authorization, Content-Type')
        if (req.headers['access-control-request-private-network'] === 'true')
          res.setHeader('access-control-allow-private-network', 'true')
        res.writeHead(204)
        res.end()
        outcome = 'preflight'
        return
      }
      const scope: IntegrationScope = ['/v1/print', '/v1/print/bar'].includes(endpoint)
        ? 'print'
        : ['/v1/preview', '/v1/preview/bar'].includes(endpoint)
          ? 'preview'
          : 'read'
      token = await this.auth(req, scope)
      if (!token)
        return json(res, 401, {
          error: 'A valid bearer token with the required scope is required.'
        })
      if (req.method === 'GET' && endpoint === '/v1/status') {
        outcome = 'ok'
        return json(res, 200, {
          name: app.getName(),
          version: app.getVersion(),
          running: true,
          port: this.actualPort
        })
      }
      if (req.method === 'GET' && endpoint === '/v1/printers') {
        outcome = 'ok'
        return json(res, 200, await new DriverPrinter().listPrinters())
      }
      if (req.method === 'GET' && endpoint === '/v1/templates') {
        outcome = 'ok'
        return json(res, 200, await listLibrary(true))
      }
      const matched = /^\/v1\/jobs\/([^/]+)$/.exec(endpoint)
      if (req.method === 'GET' && matched) {
        const job = this.jobs.get(matched[1]!)
        if (!job) return json(res, 404, { error: 'Job not found.' })
        outcome = 'ok'
        return json(res, 200, job)
      }
      if (
        req.method === 'POST' &&
        ['/v1/preview', '/v1/print', '/v1/preview/bar', '/v1/print/bar'].includes(endpoint)
      ) {
        const uploaded = endpoint.endsWith('/bar'),
          parsed = uploaded
            ? await multipart(req)
            : { archive: null, options: JSON.parse((await body(req)).toString('utf8')) },
          options = requestSchema.parse(parsed.options)
        if (!uploaded && !options.templateId) throw new Error('templateId is required.')
        const document = uploaded
            ? decodeArchive(parsed.archive!)
            : (await readLibraryTemplate(options.templateId!)).opened.document,
          records = options.records ?? []
        const quality = preflight(document, {
            prompts: options.values,
            fields: records[0]?.fields
          }),
          batch = batchPreflight(
            document,
            records.length
              ? records.map((record) => ({ key: record.key, fields: record.fields }))
              : [{ key: '1', fields: {} }],
            { prompts: options.values }
          )
        const strict = (await new SettingsStoreFile().read()).preflightMode === 'strict'
        if (strict && (quality.errors || batch.rowsWithErrors))
          return json(res, 422, { error: 'Preflight failed.', preflight: quality, batch })
        if (endpoint.startsWith('/v1/preview')) {
          const counters = document.template.variables.filter(
              (variable) => variable.kind === 'counter'
            ),
            evaluated = evaluatedDocument(document, {
              prompts: options.values,
              fields: records[0]?.fields,
              counters: Object.fromEntries(
                counters.map((counter) => [counter.name, counterValue(counter, 0)])
              )
            }).document,
            bytes =
              options.format === 'pdf' ? await renderPdf(evaluated) : await renderPng(evaluated)
          res.writeHead(200, {
            'content-type': options.format === 'pdf' ? 'application/pdf' : 'image/png',
            'content-length': bytes.length
          })
          res.end(bytes)
          outcome = 'ok'
          return
        }
        if (!options.printer) throw new Error('printer is required for printing.')
        const settings =
            (await dataRepositories().printerProfiles.read(options.printer)) ??
            DEFAULT_PRINT_SETTINGS,
          id = `api-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          job: ApiJob = { id, state: 'queued' }
        this.jobs.set(id, job)
        if (this.jobs.size > 1000) this.jobs.delete(this.jobs.keys().next().value!)
        this.broadcast(job)
        const printRequest: PrintJobRequest = {
          document,
          printerId: options.printer,
          settings,
          copies: options.copies,
          serializedLabels: records.length || options.serializedCount,
          values: options.values,
          records: records.length ? records : undefined
        }
        void (async () => {
          try {
            job.state = 'printing'
            this.broadcast(job)
            job.result = await submitPrintRequest(printRequest)
            job.state = 'done'
          } catch (error) {
            job.state = 'failed'
            job.error = error instanceof Error ? error.message : String(error)
          }
          this.broadcast(job)
        })()
        outcome = 'accepted'
        return json(res, 202, { jobId: id })
      }
      json(res, 404, { error: 'Endpoint not found.' })
    } catch (error) {
      json(res, error instanceof z.ZodError ? 400 : 500, {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      await appendIntegrationAudit({
        client: req.socket.remoteAddress ?? 'unknown',
        tokenName: token?.name ?? null,
        endpoint,
        result: outcome
      }).catch(() => undefined)
    }
  }
  private broadcast(job: ApiJob): void {
    const data = JSON.stringify({ type: 'job', job })
    for (const client of this.clients) if (client.readyState === WebSocket.OPEN) client.send(data)
  }
  private async upgrade(
    config: IntegrationConfiguration,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!this.rate(req) || this.clients.size >= 100) {
      await appendIntegrationAudit({
        client: req.socket.remoteAddress ?? 'unknown',
        tokenName: null,
        endpoint: url.pathname,
        result: 'rate-limited'
      }).catch(() => undefined)
      socket.destroy()
      return
    }
    if (
      url.pathname !== '/v1/events' ||
      (req.headers.origin && !config.allowedOrigins.includes(req.headers.origin))
    ) {
      await appendIntegrationAudit({
        client: req.socket.remoteAddress ?? 'unknown',
        tokenName: null,
        endpoint: url.pathname,
        result: 'failed'
      }).catch(() => undefined)
      socket.destroy()
      return
    }
    const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1]
    const protocol = (req.headers['sec-websocket-protocol'] ?? '')
      .split(',')
      .map((value) => value.trim())
      .find((value) => value.startsWith('barista-token.'))
    const token = await authenticateIntegrationToken(
      bearer ?? protocol?.slice('barista-token.'.length) ?? '',
      'read'
    )
    if (!token) {
      await appendIntegrationAudit({
        client: req.socket.remoteAddress ?? 'unknown',
        tokenName: null,
        endpoint: url.pathname,
        result: 'failed'
      }).catch(() => undefined)
      socket.destroy()
      return
    }
    await appendIntegrationAudit({
      client: req.socket.remoteAddress ?? 'unknown',
      tokenName: token.name,
      endpoint: url.pathname,
      result: 'connected'
    }).catch(() => undefined)
    this.sockets.handleUpgrade(req, socket, head, (client) => {
      this.clients.add(client)
      client.on('close', () => this.clients.delete(client))
      client.on('error', () => this.clients.delete(client))
      client.send(JSON.stringify({ type: 'ready' }))
    })
  }
}
export const integrationServer = new PrintApiServer()
