/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { recordMatchesFilter } from './dataSources'

describe('record picker filters', () => {
  it('separates unprinted and changed rows', () => {
    expect(recordMatchesFilter({ status: 'never-printed', changed: false }, 'unprinted')).toBe(true)
    expect(recordMatchesFilter({ status: 'printed', changed: true }, 'changed')).toBe(true)
    expect(recordMatchesFilter({ status: 'reprinted', changed: false }, 'changed')).toBe(false)
    expect(recordMatchesFilter({ status: 'failed', changed: false }, 'all')).toBe(true)
  })
})
