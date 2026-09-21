/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PrintHistoryEntry } from '@shared/ipc/contract'
import { printSettingsSchema } from '@shared/printSettings'
import type { DataRepositories } from './types'

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}

function isPrintHistoryEntry(value: unknown): value is PrintHistoryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    ['id', 'date', 'user', 'computer', 'template', 'printer', 'serialRange'].every(
      (key) => typeof item[key] === 'string'
    ) &&
    Number.isInteger(item.serializedLabels) &&
    Number.isInteger(item.copies) &&
    (item.result === 'done' || item.result === 'failed') &&
    (item.error === undefined || typeof item.error === 'string')
  )
}

export async function importLegacyJsonData(
  repositories: DataRepositories,
  root: string,
  stationId: string
): Promise<void> {
  const marker = `legacy-json-import:${stationId}`
  if (await repositories.settings.read<boolean>(marker)) return

  const history = await readJson(join(root, 'print-history.json'))
  if (Array.isArray(history)) {
    for (const entry of history) {
      if (isPrintHistoryEntry(entry)) await repositories.printHistory.append(entry)
    }
  }

  const prompts = await readJson(join(root, 'prompt-values.json'))
  if (typeof prompts === 'object' && prompts !== null && !Array.isArray(prompts)) {
    for (const [templateId, values] of Object.entries(prompts)) {
      if (isStringRecord(values)) await repositories.promptValues.write(templateId, values)
    }
  }

  const printers = await readJson(join(root, 'printers.json'))
  if (typeof printers === 'object' && printers !== null && !Array.isArray(printers)) {
    for (const [printerId, settings] of Object.entries(printers)) {
      const parsed = printSettingsSchema.safeParse(settings)
      if (parsed.success) await repositories.printerProfiles.write(printerId, parsed.data)
    }
  }

  await repositories.settings.write(marker, true)
}
