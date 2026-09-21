/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useState, type JSX, type ReactNode } from 'react'
import { makeStyles, Text, tokens } from '@fluentui/react-components'
import { ChevronDown12Regular, ChevronRight12Regular } from '@fluentui/react-icons'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '8px'
  },
  title: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: '0.04em',
    textTransform: 'uppercase'
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '4px',
    padding: '0',
    border: 'none',
    background: 'none',
    color: tokens.colorNeutralForeground3,
    cursor: 'pointer',
    textAlign: 'left'
  }
})

interface PanelSectionProps {
  id?: string
  title: string
  /** Adds a header button that shows and hides the section body. */
  collapsible?: boolean
  children: ReactNode
}

export function PanelSection({
  id,
  title,
  collapsible = false,
  children
}: PanelSectionProps): JSX.Element {
  const styles = useStyles()
  const [open, setOpen] = useState(true)

  return (
    <section id={id} className={styles.root} tabIndex={id ? -1 : undefined}>
      {collapsible ? (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <ChevronDown12Regular /> : <ChevronRight12Regular />}
          <Text size={100} className={styles.title}>
            {title}
          </Text>
        </button>
      ) : (
        <Text size={100} className={styles.title}>
          {title}
        </Text>
      )}
      {!collapsible || open ? children : null}
    </section>
  )
}
