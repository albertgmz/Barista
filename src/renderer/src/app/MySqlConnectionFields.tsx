/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { JSX } from 'react'
import { Checkbox, Field, Input, makeStyles, tokens } from '@fluentui/react-components'
import type { DataConfigurationInput } from '@shared/dataSettings'

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingVerticalM },
  span: { gridColumn: '1 / -1' },
  warning: { color: tokens.colorPaletteRedForeground1 }
})

export interface MySqlConnectionFieldsProps {
  settings: DataConfigurationInput['mysql']
  passwordSaved: boolean
  onChange<K extends keyof DataConfigurationInput['mysql']>(
    key: K,
    value: DataConfigurationInput['mysql'][K]
  ): void
}

export function MySqlConnectionFields({
  settings,
  passwordSaved,
  onChange
}: MySqlConnectionFieldsProps): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.grid}>
      <Field label="Host">
        <Input value={settings.host} onChange={(_, data) => onChange('host', data.value)} />
      </Field>
      <Field label="Port">
        <Input
          type="number"
          min={1}
          max={65535}
          value={String(settings.port)}
          onChange={(_, data) => onChange('port', Number(data.value))}
        />
      </Field>
      <Field label="Database">
        <Input value={settings.database} onChange={(_, data) => onChange('database', data.value)} />
      </Field>
      <Field label="User">
        <Input value={settings.user} onChange={(_, data) => onChange('user', data.value)} />
      </Field>
      <Field
        className={styles.span}
        label="Password"
        hint={passwordSaved ? 'Leave blank to keep the saved password.' : undefined}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={settings.password ?? ''}
          onChange={(_, data) => onChange('password', data.value)}
        />
      </Field>
      <Checkbox
        className={styles.span}
        checked={settings.tls}
        label="Require TLS and verify the server certificate"
        onChange={(_, data) => onChange('tls', data.checked === true)}
      />
      {!settings.tls && (
        <div className={`${styles.span} ${styles.warning}`} role="alert">
          This sends database credentials and label data without transport encryption.
        </div>
      )}
    </div>
  )
}
