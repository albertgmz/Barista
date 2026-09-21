/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/// <reference types="vite/client" />

import type { BaristaApi } from '@shared/ipc/contract'

declare global {
  interface Window {
    /** The preload bridge. See src/preload/index.ts. */
    readonly barista: BaristaApi
  }
}
