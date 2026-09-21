/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { AvailableUpdate, UpdatePreferences, UpdateState } from '@shared/updates'
import { initialUpdateState, reduceUpdateState } from '@shared/updates'

export interface UpdateAdapterEvents {
  checking: () => void
  available: (update: AvailableUpdate) => void
  notAvailable: () => void
  progress: (percent: number) => void
  downloaded: (update: AvailableUpdate) => void
  error: (error: Error) => void
}

export interface UpdateAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on<K extends keyof UpdateAdapterEvents>(event: K, listener: UpdateAdapterEvents[K]): void
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdateControllerOptions {
  currentVersion: string
  mode: 'installed' | 'portable' | 'development'
  releasesUrl: string
  adapter: UpdateAdapter | null
  readPreferences: () => Promise<UpdatePreferences>
  publish: (state: UpdateState) => void
}

const NETWORK_ERROR = 'Unable to check for updates. Check your internet connection and try again.'

export class UpdateController {
  private stateValue: UpdateState
  private preferences: UpdatePreferences = {
    automaticChecks: true,
    automaticDownload: false
  }

  constructor(private readonly options: UpdateControllerOptions) {
    this.stateValue = initialUpdateState(options.currentVersion, options.mode, options.releasesUrl)
    if (options.adapter) this.attach(options.adapter)
  }

  get state(): UpdateState {
    return structuredClone(this.stateValue)
  }

  async check(manual: boolean): Promise<UpdateState> {
    const adapter = this.options.adapter
    if (!adapter || !this.stateValue.canCheck) return this.state

    this.preferences = await this.options.readPreferences()
    if (!manual && !this.preferences.automaticChecks) return this.state

    this.transition({ type: 'check-started' })
    try {
      await adapter.checkForUpdates()
    } catch {
      this.transition({ type: 'error', message: NETWORK_ERROR })
    }
    return this.state
  }

  async download(): Promise<UpdateState> {
    const adapter = this.options.adapter
    if (!adapter || !this.stateValue.canDownload) return this.state
    this.transition({ type: 'download-started' })
    try {
      await adapter.downloadUpdate()
    } catch {
      this.transition({
        type: 'error',
        message: 'Unable to download the update. Check your internet connection and try again.'
      })
    }
    return this.state
  }

  install(): UpdateState {
    if (this.options.adapter && this.stateValue.canInstall) {
      this.options.adapter.quitAndInstall(false, true)
    }
    return this.state
  }

  private attach(adapter: UpdateAdapter): void {
    // The application only installs after the user presses Restart and Install.
    adapter.autoDownload = false
    adapter.autoInstallOnAppQuit = false
    adapter.on('checking', () => this.transition({ type: 'check-started' }))
    adapter.on('notAvailable', () => this.transition({ type: 'not-available' }))
    adapter.on('available', (update) => {
      this.transition({ type: 'available', update })
      if (this.preferences.automaticDownload) void this.download()
    })
    adapter.on('progress', (percent) => this.transition({ type: 'download-progress', percent }))
    adapter.on('downloaded', (update) => this.transition({ type: 'downloaded', update }))
    adapter.on('error', () => this.transition({ type: 'error', message: NETWORK_ERROR }))
  }

  private transition(event: Parameters<typeof reduceUpdateState>[1]): void {
    this.stateValue = reduceUpdateState(this.stateValue, event)
    this.options.publish(this.state)
  }
}
