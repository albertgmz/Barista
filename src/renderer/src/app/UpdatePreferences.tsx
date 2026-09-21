/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { Dispatch, JSX, SetStateAction } from 'react'
import { Checkbox, Text, makeStyles, tokens } from '@fluentui/react-components'
import type { AppSettings } from '@shared/settings'

const useStyles = makeStyles({
  root: { display: 'grid', gap: tokens.spacingVerticalM },
  note: { color: tokens.colorNeutralForeground2, maxWidth: '560px' }
})

interface UpdatePreferencesProps {
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
}

export function UpdatePreferences({ draft, setDraft }: UpdatePreferencesProps): JSX.Element {
  const styles = useStyles()
  const update = (patch: Partial<AppSettings['updates']>): void =>
    setDraft((state) => ({ ...state, updates: { ...state.updates, ...patch } }))

  return (
    <div className={styles.root}>
      <Checkbox
        checked={draft.updates.automaticChecks}
        label="Check for updates automatically"
        onChange={(_, data) => update({ automaticChecks: data.checked === true })}
      />
      <Checkbox
        checked={draft.updates.automaticDownload}
        disabled={!draft.updates.automaticChecks}
        label="Download available updates automatically"
        onChange={(_, data) => update({ automaticDownload: data.checked === true })}
      />
      <Text size={200} className={styles.note}>
        Updates are never installed without your confirmation. Portable builds open the Releases
        page instead of attempting to update themselves.
      </Text>
    </div>
  )
}
