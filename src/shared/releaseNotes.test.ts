/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { toPlainReleaseNotes } from './releaseNotes'

describe('toPlainReleaseNotes', () => {
  it('turns GitHub HTML release notes into readable plain text', () => {
    expect(
      toPlainReleaseNotes(
        '<h3>Added</h3><ul><li>Faster labels &amp; safer updates</li><li><a href="https://example.invalid">Read more</a></li></ul>'
      )
    ).toBe('Added\n\n- Faster labels & safer updates\n- Read more')
  })

  it('removes non-content HTML blocks instead of displaying them', () => {
    expect(
      toPlainReleaseNotes('<p>Ready</p><script>alert("no")</script><style>.x {}</style>')
    ).toBe('Ready')
  })
})
