/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { JSX } from 'react'
import { Divider, makeStyles, Text, tokens } from '@fluentui/react-components'
import { roundMm } from '@shared/units'
import { useDocumentStore, useEditorStore, useUiStore } from '@renderer/store'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '12px',
    boxSizing: 'border-box',
    height: '26px',
    paddingLeft: '12px',
    paddingRight: '12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2
  },
  cursor: {
    // Digits change constantly; a fixed width stops the bar from twitching.
    minWidth: '150px',
    fontVariantNumeric: 'tabular-nums'
  },
  zoom: {
    minWidth: '52px',
    fontVariantNumeric: 'tabular-nums'
  },
  divider: {
    flexGrow: 0,
    // Fluent's vertical divider floors itself at 20px via `min-height`.
    minHeight: '14px'
  },
  spacer: {
    flexGrow: 1
  },
  printer: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  }
})

export function StatusBar(): JSX.Element {
  const styles = useStyles()
  const cursorMm = useEditorStore((state) => state.cursorMm)
  const zoom = useEditorStore((state) => state.zoom)
  const labelSize = useDocumentStore((state) => state.labelSize)
  const selectedPrinterId = useUiStore((state) => state.selectedPrinterId)
  const units = useUiStore((state) => state.preferences.units)

  const unitValue = (value: number): number => roundMm(units === 'in' ? value / 25.4 : value)

  const cursor =
    cursorMm === null ? '\u2014' : `X ${unitValue(cursorMm.x)}  Y ${unitValue(cursorMm.y)} ${units}`

  return (
    <footer className={styles.root}>
      <Text size={200} className={styles.cursor}>
        {cursor}
      </Text>
      <Divider vertical className={styles.divider} />
      <Text size={200} className={styles.zoom}>
        {Math.round(zoom * 100)}%
      </Text>
      <Divider vertical className={styles.divider} />
      <Text size={200}>
        {unitValue(labelSize.widthMm)} &times; {unitValue(labelSize.heightMm)} {units}
      </Text>
      <span className={styles.spacer} />
      <Text size={200} className={styles.printer}>
        {selectedPrinterId ?? 'No printer selected'}
      </Text>
    </footer>
  )
}
