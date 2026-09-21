/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))

const compatibleLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Python-2.0',
  '(BSD-2-Clause OR MIT OR Apache-2.0)',
  '(MIT AND Zlib)',
  '(MIT OR CC0-1.0)',
  '(MIT OR WTFPL)',
  '(WTFPL OR MIT)',
  'WTFPL',
  'WTFPL OR ISC'
])

// These packages ship an MIT LICENSE file but omit the package.json license field.
const verifiedMissingMetadata = new Set(['node_modules/busboy', 'node_modules/streamsearch'])
const failures = []
let checked = 0

for (const [packagePath, metadata] of Object.entries(lock.packages)) {
  if (!packagePath) continue
  checked += 1

  if (!metadata.license) {
    if (!verifiedMissingMetadata.has(packagePath)) {
      failures.push(`${packagePath}: missing license metadata`)
      continue
    }
    const licenseText = await readFile(join(root, packagePath, 'LICENSE'), 'utf8')
    if (!licenseText.includes('Permission is hereby granted, free of charge')) {
      failures.push(`${packagePath}: expected MIT license file was not found`)
    }
    continue
  }

  if (!compatibleLicenses.has(metadata.license)) {
    failures.push(`${packagePath}: ${metadata.license}`)
  }
}

const fontRoot = join(root, 'resources', 'fonts')
const fontDirectories = (await readdir(fontRoot, { withFileTypes: true })).filter((entry) =>
  entry.isDirectory()
)
for (const directory of fontDirectories) {
  const files = await readdir(join(fontRoot, directory.name))
  const fontFiles = files.filter((file) => /\.(?:otf|ttf|woff2)$/i.test(file))
  if (fontFiles.length === 0 || !files.includes('OFL.txt')) {
    failures.push(`resources/fonts/${directory.name}: missing font binary or OFL.txt`)
  }
}

if (failures.length > 0) {
  console.error(`License audit failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(
    `License audit passed: ${checked} dependency packages and ${fontDirectories.length} font families.`
  )
}
