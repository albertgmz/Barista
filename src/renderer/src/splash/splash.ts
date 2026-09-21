/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { SplashApi } from '@shared/ipc/contract'

declare global {
  interface Window {
    splash: SplashApi
  }
}
document.getElementById('year')!.textContent = String(new Date().getFullYear())
const unsubscribe = window.splash.onStatus((status) => {
  document.getElementById('name')!.textContent = status.name
  document.getElementById('release')!.textContent = `Version ${status.version} · ${status.codename}`
  document.getElementById('status')!.textContent = status.status
  ;(document.getElementById('progress') as HTMLProgressElement).value = status.progress
})
window.splash.ready()
window.addEventListener('unload', unsubscribe, { once: true })
