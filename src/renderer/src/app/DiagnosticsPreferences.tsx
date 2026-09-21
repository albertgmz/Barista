/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { Dispatch, JSX, SetStateAction } from 'react'
import { Field, Select, Text, makeStyles, tokens } from '@fluentui/react-components'
import type { AppSettings } from '@shared/settings'

const useStyles = makeStyles({
  root: { display: 'grid', gap: tokens.spacingVerticalM },
  note: { color: tokens.colorNeutralForeground2, maxWidth: '560px' }
})

export function DiagnosticsPreferences({
  draft,
  setDraft
}: {
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
}): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.root}>
      <Field label="Log verbosity">
        <Select
          value={draft.diagnostics.level}
          onChange={(event) =>
            setDraft((state) => ({
              ...state,
              diagnostics: {
                level: event.target.value as AppSettings['diagnostics']['level']
              }
            }))
          }
        >
          <option value="error">Errors only</option>
          <option value="warn">Warnings and errors</option>
          <option value="info">Information (recommended)</option>
          <option value="debug">Debug</option>
        </Select>
      </Field>
      <Text size={200} className={styles.note}>
        Logs stay on this computer, rotate automatically, and are never uploaded. Sensitive values
        are removed before a line is written. Start Barista with --verbose for a temporary debug
        session.
      </Text>
    </div>
  )
}
