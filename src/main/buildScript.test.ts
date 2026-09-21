/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe.runIf(process.platform === 'win32')('build.bat', () => {
  it('uses the Node and npm paths found by where even when PATH contains an unmatched quote', () => {
    const nodeDirectory = dirname(process.execPath)
    const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows'
    const path = `${resolve(systemRoot, 'System32')};C:\\Program Files\\Broken Entry";${nodeDirectory}`
    const result = spawnSync('cmd.exe', ['/d', '/c', 'build.bat', '__path_probe__'], {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, PATH: path },
      encoding: 'utf8'
    })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('Unknown command "__path_probe__"')
    expect(output).not.toContain('is not recognized as an internal or external command')
    expect(output).not.toContain('Could not read the version from package.json')
  })
})
