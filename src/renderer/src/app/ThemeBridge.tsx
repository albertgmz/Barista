/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect } from 'react'
import type { JSX, ReactNode } from 'react'
import {
  FluentProvider,
  makeStyles,
  tokens,
  webDarkTheme,
  webLightTheme
} from '@fluentui/react-components'
import type { ThemeInfo } from '@shared/ipc/contract'
import { useUiStore } from '@renderer/store'

const useStyles = makeStyles({
  root: {
    height: '100%',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground3
  }
})

interface ThemeBridgeProps {
  children: ReactNode
}

/**
 * Mirrors the main process `nativeTheme` into the UI store and picks the Fluent
 * theme from it. The main process owns the decision so that the native window
 * frame and the renderer never disagree.
 */
export function ThemeBridge({ children }: ThemeBridgeProps): JSX.Element {
  const styles = useStyles()
  const isDark = useUiStore((state) => state.isDark)
  const setIsDark = useUiStore((state) => state.setIsDark)
  const setThemeSource = useUiStore((state) => state.setThemeSource)

  useEffect(() => {
    let active = true

    const apply = (info: ThemeInfo): void => {
      if (!active) {
        return
      }
      setThemeSource(info.source)
      setIsDark(info.shouldUseDarkColors)
    }

    window.barista
      .invoke('theme:get')
      .then(apply)
      .catch(() => {
        // Light is a usable fallback; nothing else in the app depends on this.
      })

    const unsubscribe = window.barista.on('theme:changed', apply)

    return () => {
      active = false
      unsubscribe()
    }
  }, [setIsDark, setThemeSource])

  // Native scrollbars and form controls read this, not the Fluent tokens.
  useEffect(() => {
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  }, [isDark])

  return (
    <FluentProvider
      applyStylesToPortals={false}
      theme={isDark ? webDarkTheme : webLightTheme}
      className={styles.root}
    >
      {children}
    </FluentProvider>
  )
}
