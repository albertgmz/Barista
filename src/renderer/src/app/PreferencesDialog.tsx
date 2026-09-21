/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Tab,
  TabList,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { AppSettings } from '@shared/settings'
import { useUiStore } from '../store'
import { DataPreferences } from './DataPreferences'
import { GeneralPreferences } from './GeneralPreferences'
import { StationPreferences } from './StationPreferences'
import { IntegrationPreferences } from './IntegrationPreferences'
import { FontPreferences } from './FontPreferences'
import { UpdatePreferences } from './UpdatePreferences'
import { DiagnosticsPreferences } from './DiagnosticsPreferences'

const useStyles = makeStyles({
  content: { display: 'grid', gap: tokens.spacingVerticalM },
  tabs: { marginBottom: tokens.spacingVerticalS }
})

export function PreferencesDialog(): JSX.Element {
  const styles = useStyles()
  const open = useUiStore((state) => state.isPreferencesOpen)
  const current = useUiStore((state) => state.preferences)
  const [draft, setDraft] = useState<AppSettings>(current)
  const [section, setSection] = useState<
    'general' | 'fonts' | 'data' | 'station' | 'integration' | 'updates' | 'diagnostics'
  >('general')

  useEffect(() => {
    if (!open) return undefined
    const timer = window.setTimeout(() => setDraft(structuredClone(current)), 0)
    return () => window.clearTimeout(timer)
  }, [open, current])

  const save = async (): Promise<void> => {
    const result = await window.barista.invoke('settings:write', draft)
    if (!result.ok) {
      window.alert(result.error.message)
      return
    }
    useUiStore.getState().applyPreferences(result.value)
    const theme = await window.barista.invoke('theme:set', result.value.theme)
    useUiStore.getState().setThemeSource(theme.source)
    useUiStore.getState().setIsDark(theme.shouldUseDarkColors)
    useUiStore.getState().setPreferencesOpen(false)
  }

  const close = (): void => useUiStore.getState().setPreferencesOpen(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => useUiStore.getState().setPreferencesOpen(data.open)}
    >
      <DialogSurface aria-describedby={undefined}>
        <DialogBody>
          <DialogTitle>Preferences</DialogTitle>
          <DialogContent className={styles.content}>
            <TabList
              className={styles.tabs}
              selectedValue={section}
              onTabSelect={(_, data) =>
                setSection(
                  data.value as
                    | 'general'
                    | 'fonts'
                    | 'data'
                    | 'station'
                    | 'integration'
                    | 'updates'
                    | 'diagnostics'
                )
              }
              aria-label="Preference sections"
            >
              <Tab value="general">General</Tab>
              <Tab value="fonts">Fonts</Tab>
              <Tab value="data">Data</Tab>
              <Tab value="station">Print Station</Tab>
              <Tab value="integration">Integration</Tab>
              <Tab value="updates">Updates</Tab>
              <Tab value="diagnostics">Diagnostics</Tab>
            </TabList>
            {section === 'general' ? (
              <GeneralPreferences draft={draft} setDraft={setDraft} />
            ) : section === 'fonts' ? (
              <FontPreferences />
            ) : section === 'station' ? (
              <StationPreferences />
            ) : section === 'integration' ? (
              <IntegrationPreferences />
            ) : section === 'updates' ? (
              <UpdatePreferences draft={draft} setDraft={setDraft} />
            ) : section === 'diagnostics' ? (
              <DiagnosticsPreferences draft={draft} setDraft={setDraft} />
            ) : (
              <DataPreferences />
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close}>
              {section === 'general' || section === 'updates' || section === 'diagnostics'
                ? 'Cancel'
                : 'Close'}
            </Button>
            {(section === 'general' || section === 'updates' || section === 'diagnostics') && (
              <Button appearance="primary" onClick={() => void save()}>
                Save
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
