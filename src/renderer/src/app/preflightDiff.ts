/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { PreflightIssue } from '@shared/preflight'

export interface PreflightDiff {
  /** Errors that the previous report did not contain, at most one per key. */
  introduced: PreflightIssue[]
  /** Keys of the errors in this report, to compare the next one against. */
  keys: string[]
}

/** Two errors are the same problem when they share a code and an object. */
function key(issue: PreflightIssue): string {
  return `${issue.code}\u0000${issue.objectId ?? ''}`
}

/**
 * Pick out the errors that have just appeared. `known` is the key list from the previous
 * report, or null for the first report of a document, whose errors are already there and
 * are never announced. Warnings and info are ignored; only the panel lists those.
 */
export function diffPreflightErrors(
  issues: readonly PreflightIssue[],
  known: readonly string[] | null
): PreflightDiff {
  const seen = known ? new Set(known) : null
  const current = new Set<string>()
  const introduced: PreflightIssue[] = []
  for (const issue of issues) {
    if (issue.severity !== 'error') continue
    const id = key(issue)
    if (current.has(id)) continue
    current.add(id)
    if (seen && !seen.has(id)) introduced.push(issue)
  }
  return { introduced, keys: [...current] }
}
