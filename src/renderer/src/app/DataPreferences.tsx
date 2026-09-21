/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useState, type JSX } from 'react'
import { Button, Field, Select, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import {
  DEFAULT_DATA_CONFIGURATION,
  type DataConfiguration,
  type DataConfigurationInput,
  type DataRuntimeStatus
} from '@shared/dataSettings'
import { MySqlConnectionFields } from './MySqlConnectionFields'

const useStyles = makeStyles({
  root: { display: 'grid', gap: tokens.spacingVerticalM },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center' },
  status: {
    padding: tokens.spacingVerticalS,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2
  },
  error: { color: tokens.colorPaletteRedForeground1 }
})

function inputFrom(configuration: DataConfiguration): DataConfigurationInput {
  const input = (engine: 'mysql' | 'mariadb' | 'postgresql') => ({
    host: configuration[engine].host,
    port: configuration[engine].port,
    database: configuration[engine].database,
    user: configuration[engine].user,
    tls: configuration[engine].tls
  })
  return {
    engine: configuration.engine,
    mysql: input('mysql'),
    mariadb: input('mariadb'),
    postgresql: input('postgresql')
  }
}

export function DataPreferences(): JSX.Element {
  const styles = useStyles()
  const [draft, setDraft] = useState<DataConfigurationInput>(() =>
    inputFrom(DEFAULT_DATA_CONFIGURATION)
  )
  const [passwordSaved, setPasswordSaved] = useState<
    Record<'mysql' | 'mariadb' | 'postgresql', boolean>
  >({ mysql: false, mariadb: false, postgresql: false })
  const [status, setStatus] = useState<DataRuntimeStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let active = true
    void Promise.all([
      window.barista.invoke('data:configuration'),
      window.barista.invoke('data:status')
    ]).then(([configuration, runtime]) => {
      if (!active) return
      if (configuration.ok) {
        setDraft(inputFrom(configuration.value))
        setPasswordSaved({
          mysql: configuration.value.mysql.passwordSaved,
          mariadb: configuration.value.mariadb.passwordSaved,
          postgresql: configuration.value.postgresql.passwordSaved
        })
      } else setError(configuration.error.message)
      if (runtime.ok) setStatus(runtime.value)
      else setError(runtime.error.message)
      setBusy(false)
    })
    return () => {
      active = false
    }
  }, [])

  const updateRemote = <K extends keyof DataConfigurationInput['mysql']>(
    key: K,
    value: DataConfigurationInput['mysql'][K]
  ): void =>
    setDraft((current) =>
      current.engine === 'sqlite'
        ? current
        : { ...current, [current.engine]: { ...current[current.engine], [key]: value } }
    )

  const test = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setMessage(null)
    const result = await window.barista.invoke('data:testConnection', draft)
    if (result.ok) {
      setMessage(result.value.message)
      setStatus({ connection: 'connected', error: null, migration: result.value.status })
    } else setError(result.error.message)
    setBusy(false)
  }

  const apply = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setMessage(null)
    const result = await window.barista.invoke('data:saveConfiguration', draft)
    if (result.ok) {
      setPasswordSaved({
        mysql: result.value.configuration.mysql.passwordSaved,
        mariadb: result.value.configuration.mariadb.passwordSaved,
        postgresql: result.value.configuration.postgresql.passwordSaved
      })
      setStatus(result.value.status)
      setDraft(inputFrom(result.value.configuration))
      setMessage('Data settings saved.')
    } else {
      setError(result.error.message)
      const runtime = await window.barista.invoke('data:status')
      if (runtime.ok) setStatus(runtime.value)
    }
    setBusy(false)
  }

  const remote = draft.engine === 'sqlite' ? null : draft.engine
  return (
    <div className={styles.root} aria-busy={busy}>
      <Field label="Data store" hint="Remote serials never fall back to the local database.">
        <Select
          value={draft.engine}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              engine: event.target.value as DataConfigurationInput['engine']
            }))
          }
        >
          <option value="sqlite">Local SQLite</option>
          <option value="mysql">Remote MySQL</option>
          <option value="mariadb">Remote MariaDB</option>
          <option value="postgresql">Remote PostgreSQL</option>
        </Select>
      </Field>

      {remote && (
        <MySqlConnectionFields
          settings={draft[remote]}
          passwordSaved={passwordSaved[remote]}
          onChange={updateRemote}
        />
      )}

      <div className={styles.actions}>
        <Button onClick={() => void test()} disabled={busy}>
          Test connection
        </Button>
        <Button appearance="primary" onClick={() => void apply()} disabled={busy}>
          Apply data settings
        </Button>
        {busy && <Spinner size="tiny" label="Checking data store" />}
      </div>

      {status && (
        <div className={styles.status} role="status">
          {status.connection === 'connected' ? 'Connected' : 'Unavailable'} · schema{' '}
          {status.migration.currentVersion} of {status.migration.latestVersion} · integrity{' '}
          {status.migration.integrity}
          {status.migration.backupPath ? ` · backup ${status.migration.backupPath}` : ''}
        </div>
      )}
      {message && <div role="status">{message}</div>}
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
    </div>
  )
}
