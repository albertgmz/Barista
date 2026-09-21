/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const [, , version, outputPath, range] = process.argv
if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) || !outputPath) {
  throw new Error('Usage: node scripts/release-notes.mjs <version> <output-file>')
}

const changelog = await readFile(resolve('CHANGELOG.md'), 'utf8')
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const headingPattern = new RegExp(
  `^## \\[${escapedVersion}\\] - (\\d{4}-\\d{2}-\\d{2}) - "([^"]+)"$`,
  'm'
)
const heading = changelog.match(headingPattern)
if (heading && heading.index !== undefined) {
  const bodyStart = heading.index + heading[0].length
  const nextHeading = changelog.slice(bodyStart).search(/^## \[/m)
  const bodyEnd = nextHeading < 0 ? changelog.length : bodyStart + nextHeading
  const notes = changelog.slice(bodyStart, bodyEnd).trim()
  if (!notes) throw new Error(`CHANGELOG.md release section ${version} is empty`)
  await writeFile(resolve(outputPath), `${notes}\n`, 'utf8')
  process.stdout.write(`Barista ${version} "${heading[2]}"`)
} else {
  if (!range) throw new Error(`No changelog section or commit range was provided for ${version}`)
  const { stdout } = await exec('git', ['log', '--no-merges', '--format=%s', range])
  const commits = stdout.trim().split('\n').filter(Boolean)
  const items = commits.length ? commits.map((commit) => `- ${commit}`) : ['- Maintenance release.']
  await writeFile(
    resolve(outputPath),
    `## What's New\n\n${items.join('\n')}\n\n---\n\nBuilt from \`${range}\`.\n`,
    'utf8'
  )
  process.stdout.write(`Barista ${version} build`)
}
