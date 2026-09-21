/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Errors shared across the process boundary.
 *
 * This lives outside `render/` because the scaffolding's stubs are spread
 * across printing, storage, serial numbers and the print API, none of which
 * have anything to do with rendering.
 */

/** Thrown by a stub whose real implementation has not been written yet. */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented yet.`)
    this.name = 'NotImplementedError'
  }
}
