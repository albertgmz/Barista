/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { strToU8, zipSync } from 'fflate'
import { redactForDiagnostics } from './redaction'

export interface DiagnosticBundleInput {
  summary: string
  preferences: unknown
  workspace: unknown
  databaseInfo: unknown
  systemReport: unknown
  logs: Record<string, string>
  crashFiles: Record<string, Uint8Array>
  optionalFiles?: Record<string, Uint8Array | string>
  username?: string
}

function json(value: unknown, username?: string): Uint8Array {
  return strToU8(`${JSON.stringify(redactForDiagnostics(value, username), null, 2)}\n`)
}

function cleanLog(text: string, username?: string): string {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.stringify(redactForDiagnostics(JSON.parse(line), username))
      } catch {
        return String(redactForDiagnostics(line, username))
      }
    })
    .join('\n')
}

export function createDiagnosticArchive(input: DiagnosticBundleInput): {
  bytes: Uint8Array
  entries: string[]
} {
  const files: Record<string, Uint8Array> = {
    'summary.txt': strToU8(String(redactForDiagnostics(input.summary, input.username))),
    'preferences.json': json(input.preferences, input.username),
    'workspace.json': json(input.workspace, input.username),
    'database-info.json': json(input.databaseInfo, input.username),
    'system-report.json': json(input.systemReport, input.username)
  }
  for (const [name, text] of Object.entries(input.logs))
    files[`logs/${name}`] = strToU8(cleanLog(text, input.username))
  for (const [name, bytes] of Object.entries(input.crashFiles)) files[`crash/${name}`] = bytes
  for (const [name, value] of Object.entries(input.optionalFiles ?? {}))
    files[name] = typeof value === 'string' ? strToU8(value) : value
  return { bytes: zipSync(files, { level: 6 }), entries: Object.keys(files).sort() }
}
