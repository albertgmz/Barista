/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { userDataPaths } from '../storage/paths'
import { createDiagnosticReport } from './service'
import {
  clearPendingCrash,
  dismissCrashNotice,
  markPendingCrashSync,
  readCrashNotice,
  readPendingCrash,
  saveCrashNotice
} from './crashState'
import { diagnosticLog } from '.'

const stateRoot = (): string => userDataPaths().diagnosticsDir
let capturing = false

/**
 * The part of Electron's `render-process-gone` details worth logging.
 *
 * Electron 44 already gives both fields, so this is a contract rather than a
 * repair: the logged shape is now what this file says it is, instead of
 * whatever the event object happens to expose, and a field a later Electron
 * adds stays out of the log until somebody decides it belongs there. The exit
 * code is the half that matters — it separates an out-of-memory kill from an
 * access violation from a forced termination, which `reason: "crashed"` does
 * not.
 */
export function rendererGoneContext(details: { reason: string; exitCode: number }): {
  reason: string
  exitCode: number
} {
  return { reason: details.reason, exitCode: details.exitCode }
}

export function isCrashReason(reason: string): boolean {
  return reason !== 'clean-exit'
}

export function markMainProcessCrash(error: unknown, origin: string): void {
  markPendingCrashSync(stateRoot(), 'main-process-crash', { error, origin })
}

export async function captureDetectedCrash(event: string, details: unknown): Promise<void> {
  if (capturing) return
  capturing = true
  const pending = markPendingCrashSync(stateRoot(), event, details)
  diagnosticLog.error(event, details)
  try {
    const report = await createDiagnosticReport({
      description: `Automatically generated after ${event}.`,
      includeCurrentDocument: false,
      currentDocumentPath: null,
      includeLastPrintData: false,
      lastPrintData: null
    })
    await saveCrashNotice(stateRoot(), {
      id: pending.id,
      path: report.path,
      createdAt: pending.createdAt
    })
    await clearPendingCrash(stateRoot())
  } catch (error) {
    diagnosticLog.error('diagnostics.crash-bundle-failed', { error })
  } finally {
    capturing = false
  }
}

export async function completePendingCrashReport(): Promise<void> {
  const pending = await readPendingCrash(stateRoot())
  if (!pending) return
  await captureDetectedCrash(pending.event, pending.details)
}

export function pendingCrashNotice(): ReturnType<typeof readCrashNotice> {
  return readCrashNotice(stateRoot())
}

export function dismissPendingCrashNotice(id: string): Promise<void> {
  return dismissCrashNotice(stateRoot(), id)
}
