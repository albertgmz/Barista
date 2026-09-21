/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRINT_SETTINGS } from '@shared/printSettings'
import type { CounterVariable } from '@shared/template/types'
import type { DataRepositories } from './types'

export function runRepositoryContract(
  name: string,
  createStore: () => Promise<DataRepositories> | DataRepositories,
  options: { skip?: boolean } = {}
): void {
  const test = options.skip ? it.skip : it
  const suffix = (): string => randomUUID()
  const counter = (sharedName: string, patch: Partial<CounterVariable> = {}): CounterVariable => ({
    id: `serial-${sharedName}`,
    name: 'serial',
    kind: 'counter',
    start: 10,
    step: 1,
    padding: 4,
    padChar: '0',
    prefix: '',
    suffix: '',
    scope: 'global',
    sharedName,
    format: 'numeric',
    alphabet: '0123456789',
    min: 0,
    max: 9999,
    overflow: 'stop',
    reset: 'never',
    failure: 'void',
    ...patch
  })

  describe(`${name} repository contract`, () => {
    test('migrates a healthy database and reports its version', async () => {
      const store = await createStore()
      expect(await store.migrationStatus()).toMatchObject({
        currentVersion: 1,
        latestVersion: 1,
        applied: [1],
        pending: [],
        integrity: 'ok'
      })
      await store.close()
    })

    test('allocates serial values atomically and releases only the latest range', async () => {
      const store = await createStore()
      const variable = counter(suffix())
      const reservations = await Promise.all(
        Array.from({ length: 40 }, () => store.serials.reserve(variable, 25))
      )
      expect(new Set(reservations.flatMap((item) => item.values)).size).toBe(1000)
      const older = await store.serials.reserve(variable, 2)
      const newer = await store.serials.reserve(variable, 2)
      await store.serials.fail(older.id, 'release')
      await store.serials.fail(newer.id, 'release')
      await expect(store.serials.peek(variable)).resolves.toBe(1012)
      await store.close()
    })

    test('persists history, prompts, printer profiles and database settings', async () => {
      const store = await createStore()
      const id = suffix()
      await store.printHistory.append({
        id: `job-${id}`,
        date: '2026-09-20T12:00:00.000Z',
        user: 'operator',
        computer: 'station-1',
        template: 'Calibration',
        printer: `printer-${id}`,
        serialRange: '0010–0011',
        serializedLabels: 2,
        copies: 1,
        result: 'done'
      })
      await store.promptValues.write(`template-${id}`, { equipment: 'EQ-10' })
      await store.printerProfiles.write(`printer-${id}`, DEFAULT_PRINT_SETTINGS)
      await store.settings.write(`strictPreflight-${id}`, true)
      expect((await store.printHistory.list()).some((entry) => entry.id === `job-${id}`)).toBe(true)
      await expect(store.promptValues.read(`template-${id}`)).resolves.toEqual({
        equipment: 'EQ-10'
      })
      await expect(store.printerProfiles.read(`printer-${id}`)).resolves.toEqual(
        DEFAULT_PRINT_SETTINGS
      )
      await expect(store.settings.read<boolean>(`strictPreflight-${id}`)).resolves.toBe(true)
      await store.close()
    })

    test('persists tracking and template library entries', async () => {
      const store = await createStore()
      const id = suffix()
      await store.printTracking.write({
        dataSourceId: `equipment-${id}`,
        recordKey: 'EQ-10',
        status: 'printed',
        lastPrintDate: '2026-09-20T12:00:00.000Z',
        jobId: `job-${id}`,
        serialUsed: '0010',
        rowHash: 'abc123',
        voidReason: null
      })
      await store.templateLibrary.upsert({
        id: `template-${id}`,
        path: `C:/labels/${id}.bar`,
        title: 'Calibration',
        description: 'Equipment calibration label',
        tags: ['equipment', 'quality'],
        status: 'approved',
        thumbnailPath: null,
        modifiedAt: '2026-09-20T11:00:00.000Z',
        indexedAt: '2026-09-20T12:00:00.000Z'
      })
      await expect(store.printTracking.read(`equipment-${id}`, 'EQ-10')).resolves.toMatchObject({
        status: 'printed',
        rowHash: 'abc123'
      })
      expect(
        (await store.templateLibrary.list()).some((entry) => entry.id === `template-${id}`)
      ).toBe(true)
      await store.templateLibrary.remove(`template-${id}`)
      expect(
        (await store.templateLibrary.list()).some((entry) => entry.id === `template-${id}`)
      ).toBe(false)
      await store.close()
    })
  })
}
