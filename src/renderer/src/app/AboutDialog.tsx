/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { Fragment, useEffect, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  ProgressBar,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import logo from '@renderer/assets/logo.svg'
import type { AppInfo } from '@shared/ipc/contract'
import type { UpdateState } from '@shared/updates'
import { useUiStore } from '@renderer/store'

const UNKNOWN = '\u2014'

const useStyles = makeStyles({
  surface: { width: 'min(640px, 90vw)', maxWidth: '640px' },
  header: { display: 'flex', alignItems: 'center', columnGap: '16px', marginBottom: '18px' },
  icon: { display: 'flex', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.24))' },
  name: { fontWeight: tokens.fontWeightSemibold, display: 'block' },
  version: { color: tokens.colorNeutralForeground2, display: 'block', marginTop: '2px' },
  rows: { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '18px', rowGap: '7px' },
  key: { color: tokens.colorNeutralForeground3 },
  value: { fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' },
  statement: { display: 'block', marginTop: '18px', color: tokens.colorNeutralForeground2 },
  links: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS, marginTop: '12px' },
  update: {
    display: 'grid',
    gap: tokens.spacingVerticalS,
    marginTop: '20px',
    padding: '14px',
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorNeutralBackground2
  },
  updateActions: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  notes: {
    whiteSpace: 'pre-wrap',
    maxHeight: '120px',
    overflowY: 'auto',
    color: tokens.colorNeutralForeground2
  }
})

function displayDate(value: string | undefined): string {
  if (!value || value === 'unknown') return UNKNOWN
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString()
}

export function AboutDialog(): JSX.Element {
  const styles = useStyles()
  const isOpen = useUiStore((state) => state.isAboutDialogOpen)
  const setOpen = useUiStore((state) => state.setAboutDialogOpen)
  const setLicensesOpen = useUiStore((state) => state.setLicensesOpen)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    const unsubscribe = window.barista.on('updates:state', (state) => {
      if (active) setUpdate(state)
    })
    void Promise.all([
      window.barista.invoke('app:getInfo'),
      window.barista.invoke('updates:getState')
    ])
      .then(([appInfo, updateState]) => {
        if (active) {
          setInfo(appInfo)
          setUpdate(updateState)
        }
      })
      .catch(() => {
        if (active) setInfo(null)
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [isOpen])

  const rows: ReadonlyArray<readonly [string, string]> = [
    ['Build date', displayDate(info?.buildDate)],
    ['Commit', info?.commit ?? UNKNOWN],
    ['Install type', info?.installType ?? UNKNOWN],
    ['Electron', info?.electronVersion ?? UNKNOWN],
    ['Chromium', info?.chromeVersion ?? UNKNOWN]
  ]
  const openExternal = (target: 'repository' | 'gpl'): void => {
    void window.barista.invoke('app:openExternal', target)
  }
  const runUpdateAction = async (action: 'check' | 'download' | 'install'): Promise<void> => {
    setUpdate(await window.barista.invoke(`updates:${action}`))
  }

  return (
    <Dialog open={isOpen} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogSurface className={styles.surface} aria-describedby={undefined}>
        <DialogBody>
          <DialogTitle>About Barista</DialogTitle>
          <DialogContent>
            <div className={styles.header}>
              <span className={styles.icon} aria-hidden>
                <img src={logo} width={78} height={78} alt="" />
              </span>
              <div>
                <Text size={600} className={styles.name}>
                  {info?.name ?? 'Barista'}
                </Text>
                <Text size={300} className={styles.version}>
                  {info ? `${info.version} “${info.codename}”` : UNKNOWN}
                </Text>
              </div>
            </div>
            <div className={styles.rows}>
              {rows.map(([key, value]) => (
                <Fragment key={key}>
                  <Text size={200} className={styles.key}>
                    {key}
                  </Text>
                  <Text size={200} className={styles.value}>
                    {value}
                  </Text>
                </Fragment>
              ))}
            </div>
            <Text size={200} className={styles.statement}>
              No telemetry. No data collection. Always 100% open source under GNU GPLv3.
            </Text>
            <div className={styles.links}>
              <Button appearance="subtle" onClick={() => openExternal('repository')}>
                GitHub repository
              </Button>
              <Button appearance="subtle" onClick={() => openExternal('gpl')}>
                GNU GPLv3
              </Button>
              <Button
                appearance="subtle"
                onClick={() => {
                  setOpen(false)
                  setLicensesOpen(true)
                }}
              >
                Open-source licenses
              </Button>
              <Button
                appearance="subtle"
                onClick={() => {
                  setOpen(false)
                  useUiStore.getState().setDiagnosticReportOpen(true)
                }}
              >
                Create Diagnostic Report…
              </Button>
            </div>
            {update ? (
              <section className={styles.update} aria-live="polite">
                <Text weight="semibold">Updates</Text>
                <Text size={200}>{update.message}</Text>
                {update.progressPercent !== undefined ? (
                  <ProgressBar value={update.progressPercent / 100} />
                ) : null}
                {update.releaseNotes ? (
                  <Text size={200} className={styles.notes}>
                    {update.releaseNotes}
                  </Text>
                ) : null}
                <div className={styles.updateActions}>
                  {update.phase === 'portable' ? (
                    <Button onClick={() => void window.barista.invoke('updates:openReleases')}>
                      Open Releases
                    </Button>
                  ) : null}
                  {update.canCheck ? (
                    <Button onClick={() => void runUpdateAction('check')}>Check for Updates</Button>
                  ) : null}
                  {update.canDownload ? (
                    <Button appearance="primary" onClick={() => void runUpdateAction('download')}>
                      Download
                    </Button>
                  ) : null}
                  {update.canInstall ? (
                    <Button appearance="primary" onClick={() => void runUpdateAction('install')}>
                      Restart and Install
                    </Button>
                  ) : null}
                </div>
              </section>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={() => setOpen(false)}>
              {update?.canInstall ? 'Later' : 'Close'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
