/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { JSX, ReactNode } from 'react'
import { makeStyles, Text, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: '8px',
    padding: '24px 16px',
    textAlign: 'center'
  },
  icon: {
    display: 'flex',
    color: tokens.colorNeutralForeground4
  },
  title: {
    fontWeight: tokens.fontWeightSemibold
  },
  description: {
    maxWidth: '240px',
    color: tokens.colorNeutralForeground3
  },
  action: {
    marginTop: '4px'
  }
})

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      <Text size={300} className={styles.title}>
        {title}
      </Text>
      <Text size={200} className={styles.description}>
        {description}
      </Text>
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  )
}
