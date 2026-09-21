/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle
} from '@fluentui/react-components'
import type { PrintHistoryEntry } from '@shared/ipc/contract'
import { useUiStore } from '../store'

export function PrintHistoryDialog(): JSX.Element {
  const open = useUiStore((state) => state.isPrintHistoryOpen)
  const [entries, setEntries] = useState<PrintHistoryEntry[]>([])
  const [template, setTemplate] = useState('')
  const [date, setDate] = useState('')
  useEffect(() => {
    if (!open) return
    void window.barista.invoke('print:history').then((result) => {
      if (result.ok) setEntries(result.value)
    })
  }, [open])
  const filtered = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (!template || entry.template.toLowerCase().includes(template.toLowerCase())) &&
          (!date || entry.date.startsWith(date))
      ),
    [entries, template, date]
  )
  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => useUiStore.getState().setPrintHistoryOpen(data.open)}
    >
      <DialogSurface style={{ maxWidth: 1000 }}>
        <DialogBody>
          <DialogTitle>Print History</DialogTitle>
          <DialogContent>
            <div className="geometry-fields">
              <label>
                Template
                <input value={template} onChange={(event) => setTemplate(event.target.value)} />
              </label>
              <label>
                Date
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
            </div>
            <div className="history-table" role="table">
              <div role="row" className="history-row history-header">
                <span>Date</span>
                <span>Template</span>
                <span>Printer</span>
                <span>Serial range</span>
                <span>Qty</span>
                <span>Result</span>
              </div>
              {filtered.map((entry) => (
                <div
                  role="row"
                  className="history-row"
                  key={entry.id}
                  title={`${entry.user}@${entry.computer}${entry.error ? ` · ${entry.error}` : ''}`}
                >
                  <span>{new Date(entry.date).toLocaleString()}</span>
                  <span>{entry.template}</span>
                  <span>{entry.printer}</span>
                  <span>{entry.serialRange || '—'}</span>
                  <span>
                    {entry.serializedLabels} × {entry.copies}
                  </span>
                  <span>{entry.result}</span>
                </div>
              ))}
              {!filtered.length && <p>No print jobs match these filters.</p>}
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              onClick={() => useUiStore.getState().setPrintHistoryOpen(false)}
            >
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
