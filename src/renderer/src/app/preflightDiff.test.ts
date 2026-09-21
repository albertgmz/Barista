/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import type { PreflightIssue, PreflightSeverity } from '@shared/preflight'
import { diffPreflightErrors } from './preflightDiff'

const issue = (
  code: string,
  severity: PreflightSeverity = 'error',
  objectId?: string
): PreflightIssue => ({
  code,
  severity,
  message: `${code} on ${objectId ?? 'the template'}`,
  ...(objectId ? { objectId, objectName: objectId } : {})
})

const overflow = issue('text.overflow', 'error', 'text-1')
const quietZone = issue('barcode.quiet-zone', 'error', 'barcode-1')

describe('diffPreflightErrors', () => {
  it('announces nothing for the first report, however many errors it has', () => {
    const first = diffPreflightErrors([overflow, quietZone], null)
    expect(first.introduced).toEqual([])
    expect(first.keys).toHaveLength(2)
  })

  it('announces an error that was not in the previous report', () => {
    const first = diffPreflightErrors([overflow], null)
    const second = diffPreflightErrors([overflow, quietZone], first.keys)
    expect(second.introduced).toEqual([quietZone])
  })

  it('stays silent while an error persists', () => {
    const first = diffPreflightErrors([], null)
    const second = diffPreflightErrors([overflow], first.keys)
    const third = diffPreflightErrors([overflow], second.keys)
    const fourth = diffPreflightErrors([overflow], third.keys)
    expect(second.introduced).toEqual([overflow])
    expect(third.introduced).toEqual([])
    expect(fourth.introduced).toEqual([])
  })

  it('announces an error again after it is fixed and reintroduced', () => {
    const raised = diffPreflightErrors([overflow], [])
    const fixed = diffPreflightErrors([], raised.keys)
    const again = diffPreflightErrors([overflow], fixed.keys)
    expect(fixed.introduced).toEqual([])
    expect(fixed.keys).toEqual([])
    expect(again.introduced).toEqual([overflow])
  })

  it('treats the same code on another object as a new error', () => {
    const other = issue('text.overflow', 'error', 'text-2')
    const first = diffPreflightErrors([overflow], null)
    const second = diffPreflightErrors([overflow, other], first.keys)
    expect(second.introduced).toEqual([other])
  })

  it('ignores warnings and info', () => {
    const first = diffPreflightErrors([], null)
    const second = diffPreflightErrors(
      [issue('object.outside-safe-area', 'warning', 'text-1'), issue('variable.unused', 'info')],
      first.keys
    )
    expect(second.introduced).toEqual([])
    expect(second.keys).toEqual([])
  })

  it('counts one error when a report repeats it, as overlapping symbols do', () => {
    const first = diffPreflightErrors([], null)
    const second = diffPreflightErrors([overflow, { ...overflow }], first.keys)
    expect(second.introduced).toEqual([overflow])
    expect(second.keys).toHaveLength(1)
  })

  it('announces a template-wide error once, whatever its message', () => {
    const first = diffPreflightErrors([], null)
    const second = diffPreflightErrors([issue('variable.undefined')], first.keys)
    const third = diffPreflightErrors(
      [issue('variable.undefined'), { ...issue('variable.undefined'), message: 'another name' }],
      second.keys
    )
    expect(second.introduced).toHaveLength(1)
    expect(third.introduced).toEqual([])
    expect(third.keys).toHaveLength(1)
  })
})
