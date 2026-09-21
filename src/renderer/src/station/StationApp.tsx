/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import './station.css'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input
} from '@fluentui/react-components'
import type { PrintHistoryEntry, PrinterInfo } from '@shared/ipc/contract'
import type { DataSourceReadResult } from '@shared/dataSources'
import type { LabelDocument } from '@shared/template/types'
import type { TemplateLibraryItem } from '@shared/station'
import { DEFAULT_PRINT_SETTINGS, type PrintSettings } from '@shared/printSettings'
import { batchPreflight, preflight } from '@shared/preflight'
import { counterValue, evaluatedDocument } from '@shared/variables'
import { canvasTextMeasurer } from '../editor/textMeasure'
import { RecordPicker } from '../dataSources/RecordPicker'

interface SelectedTemplate {
  item: TemplateLibraryItem
  document: LabelDocument
}

export function StationApp({ onOpenEditor }: { onOpenEditor: () => void }): JSX.Element {
  const [entries, setEntries] = useState<TemplateLibraryItem[]>([])
  const [selected, setSelected] = useState<SelectedTemplate | null>(null)
  const [search, setSearch] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [sourceData, setSourceData] = useState<DataSourceReadResult | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printerId, setPrinterId] = useState('')
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS)
  const [preview, setPreview] = useState('')
  const [history, setHistory] = useState<PrintHistoryEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pinAction, setPinAction] = useState<'editor' | 'exit' | null>(null)
  const [pin, setPin] = useState('')
  const [historyAction, setHistoryAction] = useState<{
    job: PrintHistoryEntry
    action: 'reprint' | 'void'
  } | null>(null)
  const [reason, setReason] = useState('')
  const previewKey = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    setBusy(true)
    const indexed = await window.barista.invoke('library:index')
    const listed = await window.barista.invoke('library:list', { approvedOnly: true })
    const jobs = await window.barista.invoke('print:history')
    if (listed.ok) setEntries(listed.value)
    else setError(listed.error.message)
    if (!indexed.ok) setError(indexed.error.message)
    else if (indexed.value.errors.length) setError(indexed.value.errors.slice(0, 3).join('\n'))
    if (jobs.ok) setHistory(jobs.value.slice(0, 12))
    setBusy(false)
  }, [])

  useEffect(() => {
    const ready = requestAnimationFrame(() =>
      requestAnimationFrame(() => window.barista.send('app:ready'))
    )
    const flush = window.barista.on('workspace:flush', () =>
      window.barista.send('workspace:flushed')
    )
    const close = window.barista.on('document:closeRequested', () => setPinAction('exit'))
    return () => {
      cancelAnimationFrame(ready)
      flush()
      close()
    }
  }, [])
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0)
    void window.barista.invoke('printer:list').then((result) => {
      if (!result.ok) return setError(result.error.message)
      setPrinters(result.value)
      setPrinterId(
        result.value.find((printer) => printer.isDefault)?.id ?? result.value[0]?.id ?? ''
      )
    })
    return () => window.clearTimeout(initial)
  }, [refresh])
  useEffect(() => {
    if (!printerId) return
    void window.barista.invoke('print:settingsRead', { printerId }).then((result) => {
      if (result.ok) setSettings(result.value)
    })
  }, [printerId])

  const prompts =
    selected?.document.template.variables.filter((variable) => variable.kind === 'prompt') ?? []
  const counters = useMemo(
    () =>
      selected?.document.template.variables.filter((variable) => variable.kind === 'counter') ?? [],
    [selected]
  )
  const source = selected?.document.template.dataSources[0]
  const records = useMemo(
    () => sourceData?.records.filter((record) => selectedKeys.includes(record.key)) ?? [],
    [sourceData, selectedKeys]
  )
  const fields = records[0]?.values
  const resolved = useMemo(
    () =>
      selected
        ? evaluatedDocument(selected.document, {
            prompts: values,
            counters: Object.fromEntries(
              counters.map((counter) => [counter.name, counterValue(counter, 0)])
            ),
            fields
          }).document
        : null,
    [selected, values, counters, fields]
  )
  const quality = useMemo(
    () =>
      selected
        ? preflight(selected.document, {
            prompts: values,
            fields,
            measureText: canvasTextMeasurer
          })
        : null,
    [selected, values, fields]
  )
  const batch = useMemo(
    () =>
      selected && source
        ? batchPreflight(
            selected.document,
            records.map((record) => ({ key: record.key, fields: record.values })),
            { prompts: values }
          )
        : null,
    [selected, source, records, values]
  )

  useEffect(() => {
    if (!resolved) return undefined
    const id = `station:${selected!.item.id}:${++previewKey.current}`
    const timer = setTimeout(() => {
      void window.barista
        .invoke('print:preview', { document: resolved, documentId: id, settings })
        .then((result) => {
          if (result.ok) setPreview(result.value)
          else setError(result.error.message)
        })
    }, 100)
    return () => clearTimeout(timer)
  }, [resolved, selected, settings])

  const choose = async (item: TemplateLibraryItem): Promise<void> => {
    setBusy(true)
    const result = await window.barista.invoke('library:read', { id: item.id })
    setBusy(false)
    if (!result.ok) return setError(result.error.message)
    setSelected(result.value)
    setValues({})
    setSelectedKeys([])
    setSourceData(null)
    setConfirmation('')
    setError('')
  }
  const print = async (): Promise<void> => {
    if (!selected) return
    if (source && !records.length) return setError('Select at least one record.')
    setBusy(true)
    setError('')
    const result = await window.barista.invoke('print:submit', {
      printerId,
      document: selected.document,
      settings,
      copies: settings.copies,
      serializedLabels: source ? records.length : 1,
      values,
      records: source
        ? records.map((record) => ({
            dataSourceId: source.id,
            key: record.key,
            rowHash: record.rowHash,
            fields: record.values
          }))
        : undefined
    })
    setBusy(false)
    if (!result.ok) return setError(result.error.message)
    setConfirmation(
      `Job ${result.value.jobId} completed${result.value.serialRange ? ` · ${result.value.serialRange}` : ''}.`
    )
    const jobs = await window.barista.invoke('print:history')
    if (jobs.ok) setHistory(jobs.value.slice(0, 12))
  }
  const authorize = async (): Promise<void> => {
    const action = pinAction
    if (!action) return
    const result = await window.barista.invoke(
      action === 'editor' ? 'station:openEditor' : 'station:exit',
      { pin }
    )
    if (!result.ok) return setError(result.error.message)
    setPinAction(null)
    setPin('')
    if (action === 'editor') onOpenEditor()
  }
  const recordAction = async (): Promise<void> => {
    if (!historyAction) return
    const result = await window.barista.invoke('station:recordHistoryAction', {
      jobId: historyAction.job.id,
      action: historyAction.action,
      reason
    })
    if (!result.ok) return setError(result.error.message)
    if (historyAction.action === 'reprint') {
      const item = entries.find((entry) => entry.title === historyAction.job.template)
      if (item) await choose(item)
      else setError('The template for that job is no longer in the approved library.')
    } else setConfirmation(`Job ${historyAction.job.id} was voided: ${reason}`)
    setHistoryAction(null)
    setReason('')
  }
  const filtered = entries.filter((entry) => {
    const query = search.toLocaleLowerCase()
    return (
      !query ||
      entry.title.toLocaleLowerCase().includes(query) ||
      entry.tags.some((tag) => tag.toLocaleLowerCase().includes(query))
    )
  })

  return (
    <main className="station-shell">
      <header className="station-header">
        <div>
          <h1>Barista Station</h1>
          <p>Approved labels · operator printing</p>
        </div>
        <div className="station-header-actions">
          <Button size="large" onClick={() => void refresh()}>
            Refresh library
          </Button>
          <Button size="large" onClick={() => setPinAction('editor')}>
            Open editor
          </Button>
          <Button size="large" onClick={() => setPinAction('exit')}>
            Exit
          </Button>
        </div>
      </header>
      {selected ? (
        <section className="station-job">
          <div className="station-form">
            <Button size="large" onClick={() => setSelected(null)}>
              ← Templates
            </Button>
            <h2>{selected.item.title}</h2>
            {prompts.map((prompt) => (
              <label key={prompt.id}>
                {prompt.label}
                {prompt.required ? ' *' : ''}
                <Input
                  size="large"
                  value={values[prompt.name] ?? prompt.defaultValue}
                  onChange={(_, data) =>
                    setValues((current) => ({ ...current, [prompt.name]: data.value }))
                  }
                />
              </label>
            ))}
            {source ? (
              <RecordPicker
                source={source}
                documentPath={selected.item.path}
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
                onData={setSourceData}
              />
            ) : null}
            <label>
              Printer
              <select value={printerId} onChange={(event) => setPrinterId(event.target.value)}>
                {printers.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {printer.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="station-preview">
            {preview ? <img src={preview} alt="Label preview" /> : <p>Preparing preview…</p>}
            <div className={quality?.errors ? 'station-quality error' : 'station-quality'}>
              Preflight: {quality?.errors ?? 0} errors · {quality?.warnings ?? 0} warnings
              {batch ? ` · ${batch.rowsWithErrors} rows with errors` : ''}
            </div>
            {quality?.issues.slice(0, 4).map((issue, index) => (
              <p key={`${issue.code}:${index}`}>
                {issue.severity.toUpperCase()}: {issue.message}
              </p>
            ))}
            {confirmation ? (
              <div className="station-confirmation" role="status">
                ✓ {confirmation}
              </div>
            ) : null}
            <Button
              appearance="primary"
              size="large"
              disabled={
                busy || !printerId || !preview || !!quality?.errors || !!batch?.rowsWithErrors
              }
              onClick={() => void print()}
            >
              {busy
                ? 'Printing…'
                : `Print ${source ? records.length : 1} label${source && records.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </section>
      ) : (
        <section className="station-library">
          <div>
            <Input
              size="large"
              aria-label="Search approved templates"
              placeholder="Search approved templates or tags"
              value={search}
              onChange={(_, data) => setSearch(data.value)}
            />
            <div className="station-template-grid">
              {filtered.map((item) => (
                <button
                  className="station-template"
                  key={item.id}
                  onClick={() => void choose(item)}
                >
                  {item.thumbnailDataUrl ? (
                    <img src={item.thumbnailDataUrl} alt="" />
                  ) : (
                    <div className="station-no-preview">No preview</div>
                  )}
                  <strong>{item.title}</strong>
                  <span>{item.tags.join(' · ')}</span>
                </button>
              ))}
            </div>
            {!busy && !filtered.length ? (
              <p>
                No approved templates found. Configure and index library folders in Preferences.
              </p>
            ) : null}
          </div>
          <aside>
            <h2>Recent jobs</h2>
            {history.map((job) => (
              <article className="station-history" key={job.id}>
                <strong>{job.template}</strong>
                <span>
                  {new Date(job.date).toLocaleString()} · {job.result}
                </span>
                <div>
                  <Button onClick={() => setHistoryAction({ job, action: 'reprint' })}>
                    Reprint…
                  </Button>
                  <Button onClick={() => setHistoryAction({ job, action: 'void' })}>Void…</Button>
                </div>
              </article>
            ))}
          </aside>
        </section>
      )}
      {error ? (
        <div className="station-error" role="alert">
          {error}
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}
      <Dialog open={pinAction !== null}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Admin PIN required</DialogTitle>
            <DialogContent>
              <Input
                aria-label="Admin PIN"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(_, data) => setPin(data.value)}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPinAction(null)}>Cancel</Button>
              <Button appearance="primary" onClick={() => void authorize()}>
                Continue
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog open={historyAction !== null}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {historyAction?.action === 'void' ? 'Void job' : 'Reprint job'}
            </DialogTitle>
            <DialogContent>
              <p>A reason is required for the audit log.</p>
              <Input
                aria-label="Action reason"
                value={reason}
                onChange={(_, data) => setReason(data.value)}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setHistoryAction(null)}>Cancel</Button>
              <Button
                appearance="primary"
                disabled={reason.trim().length < 3}
                onClick={() => void recordAction()}
              >
                Continue
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </main>
  )
}
