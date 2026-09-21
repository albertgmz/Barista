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
  Select,
  Spinner,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { DiagnosticLevel, DiagnosticLogEntry } from '@shared/diagnostics'
import { useUiStore } from '../store'

const useStyles = makeStyles({
  surface: {
    width: 'min(1100px, 94vw)',
    maxWidth: '1100px',
    height: 'min(760px, 90vh)',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column'
  },
  body: {
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  content: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    gap: tokens.spacingVerticalM,
    minHeight: 0,
    minWidth: 0,
    flex: 1
  },
  filters: {
    display: 'grid',
    gridTemplateColumns: '1fr 180px 160px',
    gap: tokens.spacingHorizontalS
  },
  list: {
    overflow: 'auto',
    minHeight: 0,
    minWidth: 0,
    fontFamily: 'JetBrains Mono',
    fontSize: '12px'
  },
  line: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '180px 54px minmax(120px, 190px) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalS,
    textAlign: 'left',
    padding: '6px 8px',
    border: 'none',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    color: tokens.colorNeutralForeground1,
    background: 'transparent',
    cursor: 'pointer'
  },
  selected: { background: tokens.colorNeutralBackground1Selected },
  detail: { minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }
})

function lineText(entry: DiagnosticLogEntry): string {
  return JSON.stringify(entry)
}

export function LogViewerDialog(): JSX.Element {
  const styles = useStyles()
  const open = useUiStore((state) => state.isLogViewerOpen)
  const setOpen = useUiStore((state) => state.setLogViewerOpen)
  const [entries, setEntries] = useState<DiagnosticLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [openedAt] = useState(() => Date.now())
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<DiagnosticLevel | 'all'>('all')
  const [time, setTime] = useState<'all' | 'hour' | 'day'>('all')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open) return
    void window.barista.invoke('diagnostics:logs').then((result) => {
      if (result.ok) setEntries(result.value)
      setLoading(false)
    })
  }, [open])
  const filtered = useMemo(() => {
    const cutoff =
      time === 'hour' ? openedAt - 60 * 60 * 1000 : time === 'day' ? openedAt - 86400000 : 0
    const term = query.trim().toLocaleLowerCase()
    return entries.filter(
      (entry) =>
        (level === 'all' || entry.level === level) &&
        Date.parse(entry.timestamp) >= cutoff &&
        (!term || lineText(entry).toLocaleLowerCase().includes(term))
    )
  }, [entries, level, openedAt, query, time])
  const copy = async (): Promise<void> => {
    const chosen = filtered.filter((_, index) => selected.has(index))
    const lines = (chosen.length ? chosen : filtered).map(lineText).join('\n')
    await window.barista.invoke('diagnostics:copyLogs', { text: lines })
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogSurface className={styles.surface} aria-describedby={undefined}>
        <DialogBody className={styles.body}>
          <DialogTitle>Diagnostic Logs</DialogTitle>
          <DialogContent className={styles.content}>
            <div className={styles.filters}>
              <Input
                aria-label="Search logs"
                placeholder="Search logs"
                value={query}
                onChange={(_, data) => setQuery(data.value)}
              />
              <Select
                aria-label="Log level"
                value={level}
                onChange={(event) => setLevel(event.target.value as DiagnosticLevel | 'all')}
              >
                <option value="all">All levels</option>
                <option value="error">Errors</option>
                <option value="warn">Warnings</option>
                <option value="info">Information</option>
                <option value="debug">Debug</option>
              </Select>
              <Select
                aria-label="Log time"
                value={time}
                onChange={(event) => setTime(event.target.value as 'all' | 'hour' | 'day')}
              >
                <option value="all">All retained</option>
                <option value="hour">Last hour</option>
                <option value="day">Last 24 hours</option>
              </Select>
            </div>
            <div className={styles.list} aria-label="Log lines">
              {loading ? <Spinner label="Loading logs" /> : null}
              {!loading && filtered.length === 0 ? <Text>No matching log lines.</Text> : null}
              {filtered.map((entry, index) => (
                <button
                  type="button"
                  key={`${entry.timestamp}-${index}`}
                  className={`${styles.line} ${selected.has(index) ? styles.selected : ''}`}
                  aria-pressed={selected.has(index)}
                  onClick={() =>
                    setSelected((current) => {
                      const next = new Set(current)
                      if (next.has(index)) next.delete(index)
                      else next.add(index)
                      return next
                    })
                  }
                >
                  <span>{new Date(entry.timestamp).toLocaleString()}</span>
                  <span>{entry.level}</span>
                  <span>{entry.event}</span>
                  <span className={styles.detail}>
                    {entry.message ?? (entry.context ? JSON.stringify(entry.context) : '')}
                  </span>
                </button>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => void window.barista.invoke('diagnostics:openLogsFolder')}>
              Open logs folder
            </Button>
            <Button onClick={() => void copy()}>Copy selected lines</Button>
            <Button appearance="primary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
