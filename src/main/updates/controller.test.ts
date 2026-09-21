/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it, vi } from 'vitest'
import type { AvailableUpdate, UpdatePreferences, UpdateState } from '@shared/updates'
import type { UpdateAdapter, UpdateAdapterEvents } from './controller'
import { UpdateController } from './controller'

class MockAdapter implements UpdateAdapter {
  autoDownload = true
  autoInstallOnAppQuit = true
  readonly checkForUpdates = vi.fn(async () => undefined)
  readonly downloadUpdate = vi.fn(async () => undefined)
  readonly quitAndInstall = vi.fn()
  private readonly listeners: Partial<{
    [K in keyof UpdateAdapterEvents]: UpdateAdapterEvents[K][]
  }> = {}

  on<K extends keyof UpdateAdapterEvents>(event: K, listener: UpdateAdapterEvents[K]): void {
    const listeners = (this.listeners[event] ??= []) as UpdateAdapterEvents[K][]
    listeners.push(listener)
  }

  emit<K extends keyof UpdateAdapterEvents>(
    event: K,
    ...args: Parameters<UpdateAdapterEvents[K]>
  ): void {
    for (const listener of this.listeners[event] ?? []) {
      ;(listener as (...values: Parameters<UpdateAdapterEvents[K]>) => void)(...args)
    }
  }
}

function createController(
  preferences: UpdatePreferences = { automaticChecks: true, automaticDownload: false }
): { controller: UpdateController; adapter: MockAdapter; published: UpdateState[] } {
  const adapter = new MockAdapter()
  const published: UpdateState[] = []
  const controller = new UpdateController({
    currentVersion: '0.4.0',
    mode: 'installed',
    releasesUrl: 'https://example.invalid/releases',
    adapter,
    readPreferences: async () => preferences,
    publish: (state) => published.push(state)
  })
  return { controller, adapter, published }
}

describe('UpdateController', () => {
  it('checks without downloading in notify-only mode and installs only on command', async () => {
    const { controller, adapter } = createController()
    expect(adapter.autoDownload).toBe(false)
    expect(adapter.autoInstallOnAppQuit).toBe(false)

    await controller.check(true)
    const update: AvailableUpdate = { version: '0.4.1', releaseNotes: 'Fixes' }
    adapter.emit('available', update)
    expect(adapter.downloadUpdate).not.toHaveBeenCalled()
    expect(controller.state).toMatchObject({ phase: 'available', canDownload: true })

    await controller.download()
    adapter.emit('downloaded', update)
    expect(adapter.quitAndInstall).not.toHaveBeenCalled()
    controller.install()
    expect(adapter.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('downloads automatically only when that preference is enabled', async () => {
    const { controller, adapter } = createController({
      automaticChecks: true,
      automaticDownload: true
    })
    await controller.check(false)
    adapter.emit('available', { version: '0.4.1' })
    await vi.waitFor(() => expect(adapter.downloadUpdate).toHaveBeenCalledOnce())
    expect(controller.state.phase).toBe('downloading')
  })

  it('skips scheduled network calls when automatic checks are disabled', async () => {
    const { controller, adapter } = createController({
      automaticChecks: false,
      automaticDownload: false
    })
    await controller.check(false)
    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
    expect(controller.state.phase).toBe('idle')
  })

  it('reports a mocked network failure without rejecting', async () => {
    const { controller, adapter } = createController()
    adapter.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    await expect(controller.check(true)).resolves.toMatchObject({ phase: 'error', canCheck: true })
  })

  it('never creates an adapter path for portable builds', async () => {
    const adapter = new MockAdapter()
    const controller = new UpdateController({
      currentVersion: '0.4.0',
      mode: 'portable',
      releasesUrl: 'https://example.invalid/releases',
      adapter: null,
      readPreferences: async () => ({ automaticChecks: true, automaticDownload: true }),
      publish: vi.fn()
    })
    await controller.check(true)
    expect(controller.state.phase).toBe('portable')
    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
  })
})
