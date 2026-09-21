/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import { initialUpdateState, reduceUpdateState } from './updates'

describe('update state', () => {
  it('moves through check, download, and explicit-install readiness', () => {
    let state = initialUpdateState('0.4.0', 'installed', 'https://example.invalid/releases')
    state = reduceUpdateState(state, { type: 'check-started' })
    expect(state.phase).toBe('checking')

    state = reduceUpdateState(state, {
      type: 'available',
      update: { version: '0.4.1', releaseNotes: 'Fixes' }
    })
    expect(state).toMatchObject({ phase: 'available', canDownload: true, canInstall: false })

    state = reduceUpdateState(state, { type: 'download-started' })
    state = reduceUpdateState(state, { type: 'download-progress', percent: 54.6 })
    expect(state).toMatchObject({ phase: 'downloading', progressPercent: 54.6 })

    state = reduceUpdateState(state, {
      type: 'downloaded',
      update: { version: '0.4.1', releaseNotes: 'Fixes' }
    })
    expect(state).toMatchObject({ phase: 'ready', canInstall: true })
  })

  it('disables self-update for portable and development builds', () => {
    expect(initialUpdateState('0.4.0', 'portable', 'https://example.invalid').phase).toBe(
      'portable'
    )
    expect(initialUpdateState('0.4.0', 'development', 'https://example.invalid').phase).toBe(
      'disabled'
    )
  })

  it('turns network failures into a retryable user-facing state', () => {
    const checking = reduceUpdateState(
      initialUpdateState('0.4.0', 'installed', 'https://example.invalid'),
      { type: 'check-started' }
    )
    expect(
      reduceUpdateState(checking, {
        type: 'error',
        message: 'Unable to check for updates. Check your internet connection and try again.'
      })
    ).toMatchObject({ phase: 'error', canCheck: true, canInstall: false })
  })
})
