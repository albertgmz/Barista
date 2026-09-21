/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect } from 'react'
import { useUiStore } from '../store'

export function usePreferences(): void {
  useEffect(() => {
    let active = true
    void window.barista.invoke('settings:read').then(async (result) => {
      if (!active || !result.ok) return
      useUiStore.getState().applyPreferences(result.value)
      const theme = await window.barista.invoke('theme:set', result.value.theme)
      if (!active) return
      useUiStore.getState().setThemeSource(theme.source)
      useUiStore.getState().setIsDark(theme.shouldUseDarkColors)
    })
    return () => {
      active = false
    }
  }, [])
}
