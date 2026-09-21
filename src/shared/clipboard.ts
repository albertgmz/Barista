/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
export interface ClipboardWriteRequest {
  text: string
  imageBase64?: string
  baristaToken?: string
}

export type ClipboardReadResult =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'image'; pngBase64: string }
  | { kind: 'barista'; token: string }
