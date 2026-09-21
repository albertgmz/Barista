/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Offsets in the public DEVMODEW header. Driver-private bytes follow dmSize.
 * Source: https://learn.microsoft.com/windows/win32/api/wingdi/ns-wingdi-devmodew
 */
export const devModeLayout = {
  size: 68,
  driverExtra: 70,
  fields: 72,
  orientation: 76,
  paperSize: 78,
  paperLength: 80,
  paperWidth: 82,
  copies: 86,
  printQuality: 90,
  yResolution: 96,
  collate: 100
} as const

const DM_ORIENTATION = 0x1,
  DM_PAPERSIZE = 0x2,
  DM_PAPERLENGTH = 0x4,
  DM_PAPERWIDTH = 0x8,
  DM_COPIES = 0x100,
  DM_PRINTQUALITY = 0x400,
  DM_YRESOLUTION = 0x2000,
  DM_COLLATE = 0x8000,
  DM_FORMNAME = 0x10000

interface DevModeOptions {
  widthMm: number
  heightMm: number
  dpiX: number
  dpiY: number
  copies: number
  collate: boolean
}

export function configureDevMode(bytes: Buffer, options: DevModeOptions): void {
  if (bytes.length < 220) throw new Error('The printer DEVMODE is too small.')
  const publicSize = bytes.readUInt16LE(devModeLayout.size),
    privateSize = bytes.readUInt16LE(devModeLayout.driverExtra)
  if (publicSize < 102 || publicSize + privateSize > bytes.length)
    throw new Error('The printer DEVMODE is truncated.')
  const portraitWidth = Math.round(Math.min(options.widthMm, options.heightMm) * 10),
    portraitLength = Math.round(Math.max(options.widthMm, options.heightMm) * 10)
  if (
    ![portraitWidth, portraitLength, options.dpiX, options.dpiY, options.copies].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 32767
    )
  )
    throw new Error('The requested paper, resolution or copy count exceeds the DEVMODE range.')
  bytes.writeUInt32LE(
    (bytes.readUInt32LE(devModeLayout.fields) & ~DM_FORMNAME) |
      DM_ORIENTATION |
      DM_PAPERSIZE |
      DM_PAPERLENGTH |
      DM_PAPERWIDTH |
      DM_COPIES |
      DM_PRINTQUALITY |
      DM_YRESOLUTION |
      DM_COLLATE,
    devModeLayout.fields
  )
  bytes.writeInt16LE(options.widthMm > options.heightMm ? 2 : 1, devModeLayout.orientation)
  bytes.writeInt16LE(0, devModeLayout.paperSize)
  bytes.writeInt16LE(portraitLength, devModeLayout.paperLength)
  bytes.writeInt16LE(portraitWidth, devModeLayout.paperWidth)
  bytes.writeInt16LE(options.copies, devModeLayout.copies)
  bytes.writeInt16LE(options.dpiX, devModeLayout.printQuality)
  bytes.writeInt16LE(options.dpiY, devModeLayout.yResolution)
  bytes.writeInt16LE(options.collate ? 1 : 0, devModeLayout.collate)
  bytes.fill(0, 102, 166)
}
