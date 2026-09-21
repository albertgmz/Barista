/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CounterVariable } from '@shared/template/types'
import { SqliteSerialService } from './counters'
const directories: string[] = []
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
)
const variable = (patch: Partial<CounterVariable> = {}): CounterVariable => ({
  id: 'serial',
  name: 'serial',
  kind: 'counter',
  start: 10,
  step: 1,
  padding: 4,
  padChar: '0',
  prefix: '',
  suffix: '',
  scope: 'global',
  sharedName: 'calibration',
  format: 'numeric',
  alphabet: '0123456789',
  min: 0,
  max: 9999,
  overflow: 'stop',
  reset: 'never',
  failure: 'void',
  ...patch
})
const service = (): SqliteSerialService => {
  const directory = mkdtempSync(join(tmpdir(), 'barista-serial-'))
  directories.push(directory)
  return new SqliteSerialService(join(directory, 'counters.db'))
}
describe('serial reservations', () => {
  it('reserves, commits and continues without duplicates', async () => {
    const serial = service(),
      first = await serial.reserve(variable(), 3)
    await serial.commit(first.id)
    const second = await serial.reserve(variable(), 2)
    expect(first.values).toEqual([10, 11, 12])
    expect(second.values).toEqual([13, 14])
    serial.close()
  })
  it('serializes concurrent reservations', async () => {
    const serial = service()
    const reservations = await Promise.all(
      Array.from({ length: 20 }, () => serial.reserve(variable(), 5))
    )
    const values = reservations.flatMap((reservation) => reservation.values)
    expect(new Set(values).size).toBe(100)
    expect(values.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 10)
    )
    serial.close()
  })
  it('releases only the newest failed reservation and otherwise voids it', async () => {
    const serial = service(),
      first = await serial.reserve(variable(), 2),
      second = await serial.reserve(variable(), 2)
    await serial.fail(first.id, 'release')
    await serial.fail(second.id, 'release')
    expect((await serial.reserve(variable(), 2)).values).toEqual([12, 13])
    serial.close()
  })
  it('resets at a configured date boundary', async () => {
    const serial = service(),
      daily = variable({ reset: 'daily' })
    await serial.reserve(daily, 2, new Date(2024, 0, 1))
    expect(await serial.peek(daily, new Date(2024, 0, 2))).toBe(10)
    serial.close()
  })
})
