/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { CSSProperties } from 'react'

/*
 * Every surface that shows a variable tints it with a hue derived from the
 * name, so the same variable is recognisable in the list, in a chip and in the
 * binding dialog. Only the hue travels: lightness and chroma are theme tokens
 * in `document.css`, which keeps the tint legible in both palettes.
 *
 * Hues are one of twelve golden-angle steps. Stepping rather than spreading the
 * hash directly keeps names that differ by a single character - `variable1` and
 * `variable2` - far apart on the wheel instead of one degree apart.
 */
const hueCount = 12
const goldenAngleTenths = 1375

export function variableHue(name: string): number {
  let hash = 0
  for (let index = 0; index < name.length; index += 1)
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  // Short lowercase names crowd the low bits, which is all `% hueCount` reads,
  // so fold the high bits down before choosing the step.
  const bucket = ((hash + (hash >>> 8) + (hash >>> 16)) >>> 0) % hueCount
  return ((bucket * goldenAngleTenths) % 3600) / 10
}

export function variableTint(name: string): CSSProperties {
  return { '--variable-hue': `${variableHue(name)}` } as CSSProperties
}
