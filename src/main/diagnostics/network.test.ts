/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('diagnostics stay local', () => {
  it('contains no network client, upload, fetch, or HTTP endpoint path', async () => {
    const root = resolve('src/main/diagnostics')
    const sources = await Promise.all(
      (await readdir(root))
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
        .map((name) => readFile(resolve(root, name), 'utf8'))
    )
    const combined = sources.join('\n')
    expect(combined).not.toMatch(/from ['"]node:(?:http|https|net|tls)['"]/)
    expect(combined).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|upload)\s*\(/)
    expect(combined).not.toMatch(/https?:\/\//)
  })
})
