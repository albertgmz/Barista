/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { variableHue, variableTint } from './variableColor'

const separation = (first: number, second: number): number => {
  const distance = Math.abs(first - second)
  return Math.min(distance, 360 - distance)
}

describe('variable colours', () => {
  it('returns the same hue for the same name', () => {
    expect(variableHue('serial')).toBe(variableHue('serial'))
    expect(variableTint('serial')).toEqual(variableTint('serial'))
  })

  it('keeps every hue on the colour wheel', () => {
    for (const name of ['serial', 'operator', 'today', 'batch', 'a', '', 'ünïcödé']) {
      const hue = variableHue(name)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })

  it('separates names that differ only in a trailing digit', () => {
    const hues = ['variable1', 'variable2', 'variable3', 'variable4'].map(variableHue)
    expect(new Set(hues).size).toBe(4)
    for (const [index, hue] of hues.entries())
      for (const other of hues.slice(index + 1)) expect(separation(hue, other)).toBeGreaterThan(30)
  })

  it('spreads a realistic set of names across distinct hues', () => {
    const names = ['serial', 'operator', 'today', 'batch', 'line', 'shift', 'lot', 'expiry']
    expect(new Set(names.map(variableHue)).size).toBeGreaterThanOrEqual(6)
  })

  it('carries the hue in a custom property so the theme owns lightness', () => {
    expect(variableTint('serial')).toEqual({ '--variable-hue': `${variableHue('serial')}` })
  })
})
