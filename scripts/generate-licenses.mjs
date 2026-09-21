/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const outputPath = resolve('resources/generated/third-party-licenses.json')
const checkOnly = process.argv.includes('--check')
const lock = JSON.parse(await readFile(resolve('package-lock.json'), 'utf8'))

const MIT = `MIT License

Copyright <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const ISC = `ISC License

Copyright <copyright holders>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`

function authorText(author) {
  if (typeof author === 'string') return author
  if (author && typeof author === 'object') {
    return [author.name, author.email, author.url].filter(Boolean).join(' · ')
  }
  return ''
}

function copyrightText(text, fallback) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        /^(?:copyright\b|©|\(c\))/i.test(line) &&
        !/<copyright holders>|\[yyyy\]|copyright holder\b/i.test(line)
    )
    .slice(0, 6)
  return lines.length > 0 ? lines.join('\n') : fallback || 'See license text.'
}

async function canonicalText(license) {
  if (license === 'MIT') return MIT
  if (license === 'ISC') return ISC
  if (license === 'Apache-2.0') return readFile(resolve('node_modules/xlsx/LICENSE'), 'utf8')
  throw new Error(`No license text or reviewed canonical fallback for ${license}`)
}

async function packageLicense(packagePath, metadata) {
  const directory = resolve(packagePath)
  const packageJson = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const files = (await readdir(directory))
    .filter((file) => /^(?:licen[cs]e|copying|unlicense)(?:\..*)?$/i.test(file))
    .sort((left, right) => left.localeCompare(right))
  let licenseText
  if (files.length > 0) {
    const sections = await Promise.all(
      files.map(
        async (file) => `----- ${file} -----\n${await readFile(join(directory, file), 'utf8')}`
      )
    )
    licenseText = sections.join('\n\n')
  } else {
    licenseText = await canonicalText(metadata.license)
  }
  const fallbackCopyright = authorText(packageJson.author) || authorText(metadata.author)
  return {
    id: `${packageJson.name}@${packageJson.version}`,
    name: packageJson.name,
    version: packageJson.version,
    license: metadata.license || packageJson.license || 'License file',
    copyright: copyrightText(licenseText, fallbackCopyright),
    licenseText: licenseText.trim(),
    kind: 'dependency'
  }
}

const byId = new Map()
for (const [packagePath, metadata] of Object.entries(lock.packages)) {
  if (!packagePath || metadata.dev === true) continue
  try {
    await access(resolve(packagePath, 'package.json'))
  } catch {
    // Optional packages for other operating systems remain in the lockfile but are not shipped.
    continue
  }
  const entry = await packageLicense(packagePath, metadata)
  byId.set(entry.id, entry)
}

const fontRoot = resolve('resources/fonts')
for (const directory of (await readdir(fontRoot, { withFileTypes: true })).filter((entry) =>
  entry.isDirectory()
)) {
  const licenseText = await readFile(join(fontRoot, directory.name, 'OFL.txt'), 'utf8')
  const fontFiles = (await readdir(join(fontRoot, directory.name))).filter((file) =>
    /\.(?:otf|ttf|woff2)$/i.test(file)
  )
  byId.set(`font:${directory.name}`, {
    id: `font:${directory.name}`,
    name: directory.name,
    version: fontFiles.join(', '),
    license: 'SIL OFL 1.1',
    copyright: copyrightText(licenseText, 'See OFL text.'),
    licenseText: licenseText.trim(),
    kind: 'font'
  })
}

const entries = [...byId.values()].sort((left, right) => left.name.localeCompare(right.name))
const generated = `${JSON.stringify({ generatedBy: 'npm run licenses:generate', entries }, null, 2)}\n`

if (checkOnly) {
  let current = ''
  try {
    current = await readFile(outputPath, 'utf8')
  } catch {
    // The comparison below reports the missing generated file.
  }
  if (current !== generated) {
    console.error('Third-party license data is stale. Run npm run licenses:generate.')
    process.exitCode = 1
  } else {
    console.log(`Third-party license data is current (${entries.length} entries).`)
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, generated, 'utf8')
  console.log(`Generated ${entries.length} third-party license entries.`)
}
