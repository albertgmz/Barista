/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */

let lastPrintData: unknown | null = null

export function setLastPrintData(value: unknown): void {
  lastPrintData = structuredClone(value)
}

export function getLastPrintData(): unknown | null {
  return lastPrintData === null ? null : structuredClone(lastPrintData)
}
