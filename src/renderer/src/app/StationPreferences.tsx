/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useState, type JSX } from 'react'
import { Button, Field, Input, makeStyles, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: { display: 'grid', gap: tokens.spacingVerticalM },
  row: { display: 'flex', gap: tokens.spacingHorizontalS },
  folder: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  grow: { flexGrow: 1 }
})

export function StationPreferences(): JSX.Element {
  const styles = useStyles()
  const [folders, setFolders] = useState<string[]>([])
  const [security, setSecurity] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => {
    void window.barista.invoke('library:folders').then((result) => {
      if (result.ok) setFolders(result.value)
    })
    void window.barista.invoke('station:security').then((result) => {
      if (result.ok) setSecurity(result.value.hasAdminPin)
    })
  }, [])
  const saveFolders = async (next = folders): Promise<void> => {
    const result = await window.barista.invoke('library:setFolders', { folders: next })
    if (!result.ok) return setStatus(result.error.message)
    setFolders(result.value)
    setStatus('Library folders saved.')
  }
  const addFolder = async (): Promise<void> => {
    const result = await window.barista.invoke('library:showFolderDialog')
    if (!result.ok) return setStatus(result.error.message)
    if (result.value && !folders.includes(result.value))
      await saveFolders([...folders, result.value])
  }
  const index = async (): Promise<void> => {
    setStatus('Indexing library…')
    const result = await window.barista.invoke('library:index')
    setStatus(
      result.ok
        ? `Indexed ${result.value.entries.length} templates${result.value.errors.length ? ` with ${result.value.errors.length} errors` : ''}.`
        : result.error.message
    )
  }
  const updatePin = async (remove = false): Promise<void> => {
    const result = await window.barista.invoke('station:setAdminPin', {
      currentPin,
      newPin: remove ? null : newPin
    })
    if (!result.ok) return setStatus(result.error.message)
    setSecurity(result.value.hasAdminPin)
    setCurrentPin('')
    setNewPin('')
    setStatus(result.value.hasAdminPin ? 'Admin PIN saved.' : 'Admin PIN removed.')
  }
  return (
    <div className={styles.root}>
      <Field
        label="Template library folders"
        hint="Local folders and Windows network shares are supported."
      >
        <div>
          {folders.map((folder) => (
            <div className={styles.folder} key={folder}>
              <span className={styles.grow}>{folder}</span>
              <Button onClick={() => void saveFolders(folders.filter((item) => item !== folder))}>
                Remove
              </Button>
            </div>
          ))}
          {!folders.length ? <p>No library folders configured.</p> : null}
        </div>
      </Field>
      <div className={styles.row}>
        <Button onClick={() => void addFolder()}>Add folder…</Button>
        <Button onClick={() => void index()}>Re-index now</Button>
      </div>
      <Field label={security ? 'Current admin PIN' : 'Admin PIN'}>
        <Input
          type="password"
          inputMode="numeric"
          value={security ? currentPin : newPin}
          onChange={(_, data) => (security ? setCurrentPin(data.value) : setNewPin(data.value))}
        />
      </Field>
      {security ? (
        <Field label="New admin PIN" hint="Use 4 to 12 digits.">
          <Input
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={(_, data) => setNewPin(data.value)}
          />
        </Field>
      ) : null}
      <div className={styles.row}>
        <Button appearance="primary" onClick={() => void updatePin(false)}>
          {security ? 'Change PIN' : 'Set PIN'}
        </Button>
        {security ? <Button onClick={() => void updatePin(true)}>Remove PIN</Button> : null}
      </div>
      {status ? <p role="status">{status}</p> : null}
    </div>
  )
}
