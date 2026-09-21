/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */

const BLOCK_END = /<\/(?:p|div|h[1-6]|ul|ol|section|article)>/gi
const BLOCK_START = /<(?:p|div|h[1-6]|ul|ol|section|article)\b[^>]*>/gi
const LIST_ITEM = /<li\b[^>]*>/gi
const TAG = /<[^>]*>/g
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
}

function decodeEntity(_match: string, value: string): string {
  const named = NAMED_ENTITIES[value.toLowerCase()]
  if (named !== undefined) return named
  const numeric =
    value.startsWith('#x') || value.startsWith('#X')
      ? Number.parseInt(value.slice(2), 16)
      : value.startsWith('#')
        ? Number.parseInt(value.slice(1), 10)
        : Number.NaN
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
    ? String.fromCodePoint(numeric)
    : `&${value};`
}

/** Converts GitHub's remote HTML release body into safe, readable dialog text. */
export function toPlainReleaseNotes(value: string): string {
  return value
    .replace(SCRIPT_OR_STYLE, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BLOCK_END, '\n')
    .replace(LIST_ITEM, '\n- ')
    .replace(BLOCK_START, '\n')
    .replace(TAG, '')
    .replace(/&([a-zA-Z]+|#\d+|#x[\da-fA-F]+);/g, decodeEntity)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
