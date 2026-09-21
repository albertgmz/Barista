/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { MenuBar } from './MenuBar'
import type { JSX } from 'react'
import logo from '@renderer/assets/logo.svg'
import { makeStyles, Text, tokens } from '@fluentui/react-components'
import { useDocumentStore } from '@renderer/store'

/** Width of the Windows caption buttons when the overlay metrics are absent. */
const CAPTION_FALLBACK = '138px'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    // Matches `titleBarOverlay.height` in the main process.
    boxSizing: 'border-box',
    height: '40px',
    paddingLeft: 'calc(env(titlebar-area-x, 0px) + 12px)',
    // The caption buttons are painted by Windows over the right end of the bar.
    paddingRight: `calc(100% - env(titlebar-area-width, calc(100% - ${CAPTION_FALLBACK})))`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorTransparentStroke}`,
    WebkitAppRegion: 'drag',
    '& button, & input, & a': {
      WebkitAppRegion: 'no-drag'
    }
  },
  icon: {
    display: 'flex',
    flexShrink: 0,
    color: tokens.colorBrandForeground1
  },
  appName: {
    flexShrink: 0,
    fontWeight: tokens.fontWeightSemibold
  },
  separator: {
    flexShrink: 0,
    width: '1px',
    height: '16px',
    backgroundColor: tokens.colorNeutralStroke2
  },
  fileName: {
    minWidth: 0,
    flex: 1,
    textAlign: 'center',
    color: tokens.colorNeutralForeground2
  }
})

export function TitleBar(): JSX.Element {
  const styles = useStyles()
  const fileName = useDocumentStore((state) => state.fileName)
  const isDirty = useDocumentStore((state) => state.isDirty)

  return (
    <header className={styles.root}>
      <span className={styles.icon} aria-hidden>
        <img src={logo} width={24} height={24} alt="" />
      </span>
      <MenuBar />
      <span className={styles.separator} aria-hidden />
      <Text size={200} truncate className={styles.fileName}>
        {isDirty ? `${fileName} \u2022` : fileName}
      </Text>
    </header>
  )
}
