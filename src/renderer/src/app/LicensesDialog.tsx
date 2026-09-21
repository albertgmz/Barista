/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Spinner,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { ThirdPartyLicense } from '@shared/licenses'
import { useUiStore } from '../store'

const useStyles = makeStyles({
  surface: {
    width: 'min(960px, 92vw)',
    maxWidth: '960px',
    height: 'min(720px, calc(100vh - 48px))',
    maxHeight: 'calc(100vh - 48px)',
    overflow: 'hidden'
  },
  body: { minHeight: 0, overflow: 'hidden' },
  content: {
    display: 'grid',
    gridTemplateColumns: '300px 1fr',
    gap: tokens.spacingHorizontalL,
    minHeight: 0,
    overflow: 'hidden'
  },
  browser: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    gap: tokens.spacingVerticalS,
    minHeight: 0
  },
  list: {
    overflowY: 'auto',
    display: 'grid',
    alignContent: 'start',
    gap: '2px',
    paddingRight: tokens.spacingHorizontalXS
  },
  item: { justifyContent: 'flex-start', textAlign: 'left', minHeight: '44px' },
  detail: { overflowY: 'auto', minWidth: 0, paddingRight: tokens.spacingHorizontalS },
  metadata: {
    display: 'grid',
    gap: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalL
  },
  license: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontFamily: 'JetBrains Mono',
    fontSize: '12px',
    lineHeight: '1.45'
  },
  empty: { color: tokens.colorNeutralForeground2, padding: tokens.spacingVerticalL }
})

export function LicensesDialog(): JSX.Element {
  const styles = useStyles()
  const open = useUiStore((state) => state.isLicensesOpen)
  const setOpen = useUiStore((state) => state.setLicensesOpen)
  const [entries, setEntries] = useState<ThirdPartyLicense[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || entries.length > 0) return
    void window.barista.invoke('licenses:list').then((result) => {
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setEntries(result.value)
      setSelectedId(result.value[0]?.id ?? null)
    })
  }, [open, entries.length])

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return entries
    return entries.filter((entry) =>
      [entry.name, entry.version, entry.license, entry.copyright, entry.kind]
        .join(' ')
        .toLocaleLowerCase()
        .includes(term)
    )
  }, [entries, query])
  const selected = filtered.find((entry) => entry.id === selectedId) ?? filtered[0]

  return (
    <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogSurface className={styles.surface} aria-describedby={undefined}>
        <DialogBody className={styles.body}>
          <DialogTitle>Open-source licenses</DialogTitle>
          <DialogContent className={styles.content}>
            <section className={styles.browser} aria-label="License catalog">
              <Input
                aria-label="Search licenses"
                placeholder="Search name or license"
                value={query}
                onChange={(_, data) => setQuery(data.value)}
              />
              <div className={styles.list}>
                {entries.length === 0 && !error ? <Spinner label="Loading licenses" /> : null}
                {filtered.map((entry) => (
                  <Button
                    key={entry.id}
                    appearance={selected?.id === entry.id ? 'primary' : 'subtle'}
                    className={styles.item}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    {entry.name} {entry.version}
                  </Button>
                ))}
                {entries.length > 0 && filtered.length === 0 ? (
                  <Text className={styles.empty}>No licenses match this search.</Text>
                ) : null}
              </div>
            </section>
            <section className={styles.detail} aria-live="polite">
              {error ? <Text>{error}</Text> : null}
              {selected ? (
                <>
                  <div className={styles.metadata}>
                    <Text size={500} weight="semibold">
                      {selected.name}
                    </Text>
                    <Text>{selected.version}</Text>
                    <Text weight="semibold">{selected.license}</Text>
                    <Text size={200}>{selected.copyright}</Text>
                  </div>
                  <pre className={styles.license}>{selected.licenseText}</pre>
                </>
              ) : null}
            </section>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
