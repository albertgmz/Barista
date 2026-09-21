/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import {
  braceQuery,
  matchingVariables,
  withActiveOffset,
  withQuery,
  type AutocompleteState
} from './templateAutocomplete'

const variables = [
  { id: '1', name: 'serial' },
  { id: '2', name: 'variant' },
  { id: '3', name: 'operator' }
]

describe('brace query', () => {
  it('returns the characters typed since the opening brace', () => {
    expect(braceQuery('Lot {')).toBe('')
    expect(braceQuery('Lot {var')).toBe('var')
    expect(braceQuery('Lot {a}{ser')).toBe('ser')
    expect(braceQuery('{is-a_name9')).toBe('is-a_name9')
  })

  it('is null when the caret is not inside a token', () => {
    expect(braceQuery('')).toBeNull()
    expect(braceQuery('plain text')).toBeNull()
    expect(braceQuery('{serial}')).toBeNull()
    expect(braceQuery('{serial} and more')).toBeNull()
    expect(braceQuery('{two words')).toBeNull()
    expect(braceQuery('{line\nbreak')).toBeNull()
  })
})

describe('autocomplete filtering', () => {
  it('lists every variable for an empty query', () => {
    expect(matchingVariables(variables, '')).toHaveLength(3)
  })

  it('narrows to the matching names, ignoring case', () => {
    expect(matchingVariables(variables, 'var').map((variable) => variable.name)).toEqual([
      'variant'
    ])
    expect(matchingVariables(variables, 'ER').map((variable) => variable.name)).toEqual([
      'serial',
      'operator'
    ])
    expect(matchingVariables(variables, 'zzz')).toEqual([])
  })
})

describe('autocomplete active option', () => {
  const state: AutocompleteState = { query: 'var', activeIndex: 0 }

  it('moves down and up through the options', () => {
    expect(withActiveOffset(state, 1, 4).activeIndex).toBe(1)
    expect(withActiveOffset({ ...state, activeIndex: 2 }, -1, 4).activeIndex).toBe(1)
  })

  it('wraps around at both ends', () => {
    expect(withActiveOffset({ ...state, activeIndex: 3 }, 1, 4).activeIndex).toBe(0)
    expect(withActiveOffset(state, -1, 4).activeIndex).toBe(3)
  })

  it('keeps the query while moving', () => {
    expect(withActiveOffset(state, 1, 4).query).toBe('var')
  })

  it('resets the active option when the filter changes', () => {
    expect(withQuery({ query: 'var', activeIndex: 2 }, 'vari')).toEqual({
      query: 'vari',
      activeIndex: 0
    })
  })

  it('keeps the active option when the filter is unchanged', () => {
    const unchanged: AutocompleteState = { query: 'var', activeIndex: 2 }
    expect(withQuery(unchanged, 'var')).toBe(unchanged)
  })
})
