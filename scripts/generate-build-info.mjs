/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
let commit = 'unknown'
try {
  commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim()
} catch {
  // Source archives may not include Git metadata.
}

const output = resolve('resources/generated/build-info.json')
await mkdir(dirname(output), { recursive: true })
await writeFile(
  output,
  `${JSON.stringify(
    {
      version: packageJson.version,
      codename: 'Espresso',
      buildDate: new Date().toISOString(),
      commit
    },
    null,
    2
  )}\n`,
  'utf8'
)
