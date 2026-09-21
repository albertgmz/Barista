/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */

export type UpdatePhase =
  | 'idle'
  | 'disabled'
  | 'portable'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  availableVersion?: string
  releaseNotes?: string
  progressPercent?: number
  message: string
  canCheck: boolean
  canDownload: boolean
  canInstall: boolean
  releasesUrl?: string
}

export interface UpdatePreferences {
  automaticChecks: boolean
  automaticDownload: boolean
}

export interface AvailableUpdate {
  version: string
  releaseNotes?: string
}

export type UpdateEvent =
  | { type: 'check-started' }
  | { type: 'not-available' }
  | { type: 'available'; update: AvailableUpdate }
  | { type: 'download-started' }
  | { type: 'download-progress'; percent: number }
  | { type: 'downloaded'; update: AvailableUpdate }
  | { type: 'error'; message: string }

export function initialUpdateState(
  currentVersion: string,
  mode: 'installed' | 'portable' | 'development',
  releasesUrl: string
): UpdateState {
  if (mode === 'portable') {
    return {
      phase: 'portable',
      currentVersion,
      message: 'Portable builds do not update themselves. Download a new version from Releases.',
      canCheck: false,
      canDownload: false,
      canInstall: false,
      releasesUrl
    }
  }
  if (mode === 'development') {
    return {
      phase: 'disabled',
      currentVersion,
      message: 'Update checks are available in installed builds.',
      canCheck: false,
      canDownload: false,
      canInstall: false
    }
  }
  return {
    phase: 'idle',
    currentVersion,
    message: 'Ready to check for updates.',
    canCheck: true,
    canDownload: false,
    canInstall: false
  }
}

export function reduceUpdateState(state: UpdateState, event: UpdateEvent): UpdateState {
  switch (event.type) {
    case 'check-started':
      return {
        ...state,
        phase: 'checking',
        message: 'Checking for updates…',
        canCheck: false,
        canDownload: false,
        canInstall: false,
        progressPercent: undefined
      }
    case 'not-available':
      return {
        ...state,
        phase: 'up-to-date',
        message: `Barista ${state.currentVersion} is up to date.`,
        canCheck: true,
        canDownload: false,
        canInstall: false,
        availableVersion: undefined,
        releaseNotes: undefined,
        progressPercent: undefined
      }
    case 'available':
      return {
        ...state,
        phase: 'available',
        message: `Barista ${event.update.version} is available.`,
        canCheck: true,
        canDownload: true,
        canInstall: false,
        availableVersion: event.update.version,
        releaseNotes: event.update.releaseNotes,
        progressPercent: undefined
      }
    case 'download-started':
      return {
        ...state,
        phase: 'downloading',
        message: 'Downloading update…',
        canCheck: false,
        canDownload: false,
        canInstall: false,
        progressPercent: 0
      }
    case 'download-progress': {
      const percent = Math.min(100, Math.max(0, event.percent))
      return {
        ...state,
        phase: 'downloading',
        message: `Downloading update… ${Math.round(percent)}%`,
        progressPercent: percent
      }
    }
    case 'downloaded':
      return {
        ...state,
        phase: 'ready',
        message: `Barista ${event.update.version} is ready to install.`,
        canCheck: false,
        canDownload: false,
        canInstall: true,
        availableVersion: event.update.version,
        releaseNotes: event.update.releaseNotes,
        progressPercent: 100
      }
    case 'error':
      return {
        ...state,
        phase: 'error',
        message: event.message,
        canCheck: true,
        canDownload: state.phase === 'available',
        canInstall: false,
        progressPercent: undefined
      }
  }
}
