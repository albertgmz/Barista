/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { configureDevMode, devModeLayout } from './gdiDevMode'

describe('GDI DEVMODE configuration', () => {
  it('sets custom stock, orientation, resolution, copies and collate flags', () => {
    const bytes = Buffer.alloc(300)
    bytes.writeUInt16LE(220, devModeLayout.size)
    configureDevMode(bytes, {
      widthMm: 60,
      heightMm: 35,
      dpiX: 300,
      dpiY: 600,
      copies: 3,
      collate: true
    })

    expect(bytes.readUInt32LE(devModeLayout.fields)).toBe(0xa50f)
    expect(bytes.readInt16LE(devModeLayout.orientation)).toBe(2)
    expect(bytes.readInt16LE(devModeLayout.paperSize)).toBe(0)
    expect(bytes.readInt16LE(devModeLayout.paperLength)).toBe(600)
    expect(bytes.readInt16LE(devModeLayout.paperWidth)).toBe(350)
    expect(bytes.readInt16LE(devModeLayout.copies)).toBe(3)
    expect(bytes.readInt16LE(devModeLayout.printQuality)).toBe(300)
    expect(bytes.readInt16LE(devModeLayout.yResolution)).toBe(600)
    expect(bytes.readInt16LE(devModeLayout.collate)).toBe(1)
  })

  it('rejects truncated, invalid and out-of-range structures', () => {
    expect(() => configureDevMode(Buffer.alloc(100), validOptions)).toThrow('too small')
    const truncated = Buffer.alloc(220)
    truncated.writeUInt16LE(300, devModeLayout.size)
    expect(() => configureDevMode(truncated, validOptions)).toThrow('truncated')
    const valid = Buffer.alloc(220)
    valid.writeUInt16LE(220, devModeLayout.size)
    expect(() => configureDevMode(valid, { ...validOptions, widthMm: 4000 })).toThrow(
      'DEVMODE range'
    )
  })
})

const validOptions = {
  widthMm: 60,
  heightMm: 35,
  dpiX: 300,
  dpiY: 300,
  copies: 1,
  collate: false
}
