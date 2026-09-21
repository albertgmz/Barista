/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ThirdPartyLicense } from '@shared/licenses'

describe('generated third-party licenses', () => {
  it('contains complete metadata and full text for dependencies and every bundled font', async () => {
    const value = JSON.parse(
      await readFile(resolve('resources/generated/third-party-licenses.json'), 'utf8')
    ) as { entries: ThirdPartyLicense[] }

    expect(value.entries.length).toBeGreaterThan(200)
    for (const entry of value.entries) {
      expect(entry.name).not.toBe('')
      expect(entry.version).not.toBe('')
      expect(entry.license).not.toBe('')
      expect(entry.copyright).not.toBe('')
      expect(entry.licenseText.length).toBeGreaterThan(100)
    }
    expect(
      value.entries.filter((entry) => entry.kind === 'font').map((entry) => entry.name)
    ).toEqual(['arimo', 'inter', 'jetbrains-mono', 'ocr-b', 'roboto-condensed'])
  })
})
