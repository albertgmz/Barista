/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CrashNotice } from '@shared/diagnostics'
import { redactForDiagnostics } from './redaction'

export interface PendingCrash {
  id: string
  createdAt: string
  event: string
  details: unknown
}

const pendingPath = (root: string): string => join(root, 'pending-crash.json')
const noticePath = (root: string): string => join(root, 'crash-notice.json')

export function markPendingCrashSync(root: string, event: string, details: unknown): PendingCrash {
  const value: PendingCrash = {
    id: `${Date.now()}-${process.pid}`,
    createdAt: new Date().toISOString(),
    event,
    details: redactForDiagnostics(details)
  }
  mkdirSync(root, { recursive: true })
  writeFileSync(pendingPath(root), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return value
}

export async function readPendingCrash(root: string): Promise<PendingCrash | null> {
  try {
    return JSON.parse(await readFile(pendingPath(root), 'utf8')) as PendingCrash
  } catch {
    return null
  }
}

export async function clearPendingCrash(root: string): Promise<void> {
  await unlink(pendingPath(root)).catch(() => undefined)
}

export async function saveCrashNotice(root: string, notice: CrashNotice): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(noticePath(root), `${JSON.stringify(notice, null, 2)}\n`, 'utf8')
}

export async function readCrashNotice(root: string): Promise<CrashNotice | null> {
  try {
    return JSON.parse(await readFile(noticePath(root), 'utf8')) as CrashNotice
  } catch {
    return null
  }
}

export async function dismissCrashNotice(root: string, id: string): Promise<void> {
  const current = await readCrashNotice(root)
  if (current?.id === id) await unlink(noticePath(root)).catch(() => undefined)
}
