/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createDiagnosticArchive } from './bundle'

describe('diagnostic bundle', () => {
  it('contains the required files and redacts secrets even from injected log lines', () => {
    const result = createDiagnosticArchive({
      summary: 'User path C:\\Users\\albert\\label.bar password=summary-secret',
      preferences: { password: 'database-secret', diagnostics: { level: 'info' } },
      workspace: { layout: 'default' },
      databaseInfo: { engine: 'sqlite', rowCounts: { labels: 2 } },
      systemReport: { apiToken: 'abcdefghijkl9876' },
      logs: {
        'barista.jsonl': `${JSON.stringify({ event: 'test', password: 'log-secret', path: 'C:\\Users\\albert\\file.xlsx' })}\n`
      },
      crashFiles: { 'dump.dmp': new Uint8Array([1, 2, 3]) },
      username: 'albert'
    })
    const files = unzipSync(result.bytes)
    expect(Object.keys(files).sort()).toEqual([
      'crash/dump.dmp',
      'database-info.json',
      'logs/barista.jsonl',
      'preferences.json',
      'summary.txt',
      'system-report.json',
      'workspace.json'
    ])
    const combined = Object.values(files)
      .map((value) => strFromU8(value))
      .join('\n')
    for (const secret of ['summary-secret', 'database-secret', 'log-secret', 'abcdefghijkl9876'])
      expect(combined).not.toContain(secret)
    expect(combined).not.toContain('C:\\Users\\albert')
    expect(combined).toContain('%USER%')
    expect(combined).toContain('…9876')
  })
})
