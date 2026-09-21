/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { appendFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { DiagnosticLevel } from '@shared/diagnostics'
import { redactForDiagnostics } from './redaction'

const LEVEL_PRIORITY: Record<DiagnosticLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 }

export interface LoggerOptions {
  directory: string
  level?: DiagnosticLevel
  maxBytes?: number
  keepMs?: number
  now?: () => Date
  username?: string
}

export class RollingJsonLogger {
  private readonly activePath: string
  private readonly maxBytes: number
  private readonly keepMs: number
  private readonly now: () => Date
  private readonly username?: string
  private level: DiagnosticLevel
  private queued: Promise<void> = Promise.resolve()
  private currentBytes = 0

  constructor(private readonly options: LoggerOptions) {
    this.activePath = join(options.directory, 'barista.jsonl')
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024
    this.keepMs = options.keepMs ?? 7 * 24 * 60 * 60 * 1000
    this.now = options.now ?? (() => new Date())
    this.level = options.level ?? 'info'
    this.username = options.username
  }

  async initialize(): Promise<void> {
    await mkdir(this.options.directory, { recursive: true })
    try {
      this.currentBytes = (await stat(this.activePath)).size
    } catch {
      this.currentBytes = 0
    }
    await this.removeExpired()
  }

  setLevel(level: DiagnosticLevel): void {
    this.level = level
  }

  log(level: DiagnosticLevel, event: string, context?: unknown, message?: string): void {
    if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[this.level]) return
    const timestamp = this.now().toISOString()
    const safe = redactForDiagnostics({ timestamp, level, event, message, context }, this.username)
    const line = `${JSON.stringify(safe)}\n`
    const bytes = Buffer.byteLength(line)
    this.queued = this.queued
      .then(async () => {
        if (this.currentBytes > 0 && this.currentBytes + bytes > this.maxBytes) await this.rotate()
        await appendFile(this.activePath, line, 'utf8')
        this.currentBytes += bytes
      })
      .catch(() => undefined)
  }

  error(event: string, context?: unknown, message?: string): void {
    this.log('error', event, context, message)
  }
  warn(event: string, context?: unknown, message?: string): void {
    this.log('warn', event, context, message)
  }
  info(event: string, context?: unknown, message?: string): void {
    this.log('info', event, context, message)
  }
  debug(event: string, context?: unknown, message?: string): void {
    this.log('debug', event, context, message)
  }

  async flush(): Promise<void> {
    await this.queued
  }

  private async rotate(): Promise<void> {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-')
    await rename(this.activePath, join(this.options.directory, `barista-${stamp}.jsonl`)).catch(
      () => undefined
    )
    this.currentBytes = 0
    await this.removeExpired()
  }

  private async removeExpired(): Promise<void> {
    const cutoff = this.now().getTime() - this.keepMs
    const files = await readdir(this.options.directory, { withFileTypes: true })
    await Promise.all(
      files
        .filter((entry) => entry.isFile() && /^barista-.*\.jsonl$/.test(entry.name))
        .map(async (entry) => {
          const path = join(this.options.directory, entry.name)
          if ((await stat(path)).mtimeMs < cutoff) await unlink(path).catch(() => undefined)
        })
    )
  }
}
