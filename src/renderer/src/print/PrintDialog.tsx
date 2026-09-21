/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { LabelSetupContent } from '../editor/LabelSetupDialog'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  Button,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@fluentui/react-components'
import type { PrinterInfo } from '@shared/ipc/contract'
import type { DataSourceReadResult } from '@shared/dataSources'
import { DEFAULT_PRINT_SETTINGS, printLayout, type PrintSettings } from '@shared/printSettings'
import { useDocumentStore, useUiStore } from '../store'
import { unwrap } from '../editor/fileActions'
import { canvasTextMeasurer } from '../editor/textMeasure'
import {
  counterValue,
  evaluatedDocument,
  evaluateVariables,
  formatCounter
} from '@shared/variables'
import { RecordPicker } from '../dataSources/RecordPicker'
import { batchPreflight, preflight } from '@shared/preflight'
import { setLastPrintData } from '../app/diagnosticContext'
export function PrintDialog(): JSX.Element {
  const open = useUiStore((s) => s.isPrintDialogOpen)
  const setup = useUiStore((s) => s.isLabelSetupOpen)
  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (d.type === 'escapeKeyDown' && !useUiStore.getState().isLabelSetupOpen)
          useUiStore.getState().setPrintDialogOpen(d.open)
      }}
    >
      <DialogSurface style={{ maxWidth: 960, width: '90vw' }}>
        {open && (
          <>
            <div hidden={setup}>
              <PrintSettingsDialog />
            </div>
            {setup && <LabelSetupContent />}
          </>
        )}
      </DialogSurface>
    </Dialog>
  )
}
function PrintSettingsDialog(): JSX.Element {
  const document = useDocumentStore((s) => s.document)
  const [printers, setPrinters] = useState<PrinterInfo[]>([]),
    [printerId, setPrinterId] = useState(''),
    [settings, setSettings] = useState(DEFAULT_PRINT_SETTINGS),
    [serializedLabels, setSerializedLabels] = useState(1),
    [recordIndex, setRecordIndex] = useState(0),
    [values, setValues] = useState<Record<string, string>>({}),
    [fonts, setFonts] = useState<string[]>(),
    [sourceData, setSourceData] = useState<DataSourceReadResult | null>(null),
    [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [preview, setPreview] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('')
  const previewSource = useRef<unknown>(null),
    previewSequence = useRef(0),
    previewId = useRef('')
  const update = (patch: Partial<PrintSettings>): void => setSettings((s) => ({ ...s, ...patch }))
  const prompts = useMemo(
    () => document.template.variables.filter((variable) => variable.kind === 'prompt'),
    [document.template.variables]
  )
  const counters = useMemo(
    () => document.template.variables.filter((variable) => variable.kind === 'counter'),
    [document.template.variables]
  )
  const source = document.template.dataSources[0]
  const selectedRecords = useMemo(
    () => sourceData?.records.filter((record) => selectedKeys.includes(record.key)) ?? [],
    [selectedKeys, sourceData]
  )
  const recordCount = source ? selectedRecords.length : serializedLabels
  const safeRecordIndex = Math.min(recordIndex, Math.max(0, recordCount - 1))
  const currentFields = selectedRecords[safeRecordIndex]?.values
  const receiveSourceData = useCallback((data: DataSourceReadResult | null) => {
    setSourceData(data)
  }, [])
  const previewDocument = useMemo(
    () =>
      evaluatedDocument(document, {
        prompts: values,
        counters: Object.fromEntries(
          counters.map((counter) => [counter.name, counterValue(counter, recordIndex)])
        ),
        fields: currentFields
      }).document,
    [document, values, counters, recordIndex, currentFields]
  )
  const currentPreflight = useMemo(
    () =>
      preflight(document, {
        prompts: values,
        counters: Object.fromEntries(
          counters.map((counter) => [counter.name, counterValue(counter, safeRecordIndex)])
        ),
        fields: currentFields,
        installedFonts: fonts,
        measureText: canvasTextMeasurer
      }),
    [document, values, counters, safeRecordIndex, currentFields, fonts]
  )
  const batchReport = useMemo(
    () =>
      source
        ? batchPreflight(
            document,
            selectedRecords.map((record) => ({ key: record.key, fields: record.values })),
            { prompts: values, installedFonts: fonts, measureText: canvasTextMeasurer }
          )
        : null,
    [document, selectedRecords, source, values, fonts]
  )
  const strictBlocked =
    useUiStore.getState().preferences.preflightMode === 'strict' &&
    (currentPreflight.errors > 0 || (batchReport?.rowsWithErrors ?? 0) > 0)
  useEffect(() => {
    void window.barista
      .invoke('print:promptValuesRead', { templateId: document.template.id })
      .then((result) => {
        if (result.ok) setValues(result.value)
      })
  }, [document.template.id])
  useEffect(() => {
    let active = true
    void window.barista.invoke('fonts:list').then((response) => {
      if (active && response.ok)
        setFonts(response.value.families.flatMap((font) => [font.family, ...font.aliases]))
    })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    let active = true
    void window.barista.invoke('printer:list').then((r) => {
      if (!active) return
      if (!r.ok) {
        setError(r.error.message)
        return
      }
      setPrinters(r.value)
      const preferred = r.value.find((p) => p.isDefault) ?? r.value[0]
      if (preferred?.paperWidthMm && preferred.paperHeightMm)
        setSettings((s) => ({
          ...s,
          paperWidthMm: preferred.paperWidthMm!,
          paperHeightMm: preferred.paperHeightMm!,
          marginMm: preferred.marginMm ?? 0
        }))
      setPrinterId(r.value.find((p) => p.isDefault)?.id ?? r.value[0]?.id ?? '')
      if (!r.value.length) setError('No printers installed. Add a printer in Windows Settings.')
    })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    if (!printerId) return
    let active = true
    void window.barista.invoke('print:settingsRead', { printerId }).then((r) => {
      if (active && r.ok) setSettings(r.value)
    })
    return () => {
      active = false
    }
  }, [printerId])
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      const changed = previewSource.current !== previewDocument
      if (changed) {
        previewSource.current = previewDocument
        previewSequence.current += 1
        previewId.current = `${document.template.id}:${previewSequence.current}`
      }
      void window.barista
        .invoke('print:preview', {
          document: changed ? previewDocument : undefined,
          documentId: previewId.current,
          settings
        })
        .then((r) => {
          if (!active) return
          if (r.ok) {
            setPreview(r.value)
            setError('')
          } else {
            setPreview('')
            setError(r.error.message)
          }
        })
    }, 150)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [document.template.id, previewDocument, settings])
  useEffect(() => window.barista.on('print:status', (job) => setStatus(job.error ?? job.state)), [])
  let layout
  try {
    layout = printLayout(document.template.stock, settings)
  } catch {
    layout = null
  }
  const numeric = (
    key:
      | 'copies'
      | 'customScale'
      | 'offsetX'
      | 'offsetY'
      | 'paperWidthMm'
      | 'paperHeightMm'
      | 'marginMm',
    label: string,
    min: number,
    max: number,
    step = 1
  ): JSX.Element => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={settings[key]}
        onChange={(e) => {
          const n = e.target.valueAsNumber
          if (Number.isFinite(n) && n >= min && n <= max) update({ [key]: n })
        }}
      />
    </label>
  )
  const check = (
    key: 'collate' | 'monochrome' | 'chooseLabelPaper',
    label: string
  ): JSX.Element => (
    <label>
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => update({ [key]: e.target.checked })}
      />
      {label}
    </label>
  )
  const print = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      if (source && !selectedRecords.length) throw new Error('Select at least one data record.')
      if (strictBlocked)
        throw new Error(
          'Strict preflight is enabled. Resolve all preflight errors before printing.'
        )
      const validation = evaluateVariables(document.template.variables, {
        prompts: values,
        fields: currentFields
      })
      if (validation.errors.length) throw new Error(validation.errors.join('\n'))
      unwrap(await window.barista.invoke('print:settingsWrite', { printerId, settings }))
      unwrap(
        await window.barista.invoke('print:promptValuesWrite', {
          templateId: document.template.id,
          values
        })
      )
      const request = {
        printerId,
        document,
        settings,
        copies: settings.copies,
        serializedLabels: recordCount,
        values,
        records: source
          ? selectedRecords.map((record) => ({
              dataSourceId: source.id,
              key: record.key,
              rowHash: record.rowHash,
              fields: record.values
            }))
          : undefined
      }
      const submitted = unwrap(await window.barista.invoke('print:submit', request))
      setLastPrintData({
        template: document.template.metadata.title,
        printerId,
        copies: settings.copies,
        serializedLabels: recordCount,
        values,
        records: request.records,
        serialRange: submitted.serialRange ?? null
      })
      setStatus(
        `${settings.printMethod === 'gdi' ? 'Native Windows job submitted.' : printerId === 'Microsoft Print to PDF' ? 'PDF saved at the requested paper size.' : 'Sent to Windows spooler.'}${submitted.serialRange ? ` Serial range ${submitted.serialRange}.` : ''}`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const printerProperties = async (): Promise<void> => {
    if (!printerId) return
    setBusy(true)
    setError('')
    try {
      const devMode = unwrap(
        await window.barista.invoke('print:properties', {
          printerId,
          devMode: settings.gdiDevMode
        })
      )
      if (devMode) {
        const next = { ...settings, gdiDevMode: devMode }
        setSettings(next)
        unwrap(await window.barista.invoke('print:settingsWrite', { printerId, settings: next }))
        setStatus('Printer driver settings saved for this printer.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <DialogBody>
      <DialogTitle>Print</DialogTitle>
      <DialogContent>
        <div className="print-layout">
          <div className="print-settings">
            <label>
              Printer
              <select
                aria-label="Printer"
                value={printerId}
                disabled={busy}
                onChange={(e) => setPrinterId(e.target.value)}
              >
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <small>
              {printers.find((p) => p.id === printerId)?.status ?? 'No printers available'}
            </small>
            <fieldset>
              <legend>Windows print method</legend>
              <label>
                <input
                  type="radio"
                  name="print-method"
                  checked={settings.printMethod === 'electron'}
                  onChange={() => update({ printMethod: 'electron' })}
                />
                Electron (recommended)
              </label>
              <label>
                <input
                  type="radio"
                  name="print-method"
                  checked={settings.printMethod === 'gdi'}
                  onChange={() => update({ printMethod: 'gdi' })}
                />
                GDI native (for drivers that ignore custom sizes)
              </label>
              <Button disabled={busy || !printerId} onClick={() => void printerProperties()}>
                Printer Properties…
              </Button>
            </fieldset>
            <div className="geometry-fields">
              {numeric('copies', 'Copies of each label', 1, 9999)}
              {!source ? (
                <label>
                  Serialized labels
                  <input
                    aria-label="Serialized labels"
                    type="number"
                    min={1}
                    max={100000}
                    value={serializedLabels}
                    onChange={(event) => {
                      const value = event.target.valueAsNumber
                      if (Number.isInteger(value) && value >= 1 && value <= 100000) {
                        setSerializedLabels(value)
                        setRecordIndex((index) => Math.min(index, value - 1))
                      }
                    }}
                  />
                </label>
              ) : null}
              {check('collate', 'Collate')}
            </div>
            {prompts.length > 0 && (
              <fieldset>
                <legend>Print-time data</legend>
                {prompts.map((prompt) => (
                  <label key={prompt.id}>
                    {prompt.label}
                    {prompt.required ? ' *' : ''}
                    {prompt.options.length ? (
                      <select
                        value={values[prompt.name] ?? prompt.defaultValue}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [prompt.name]: event.target.value
                          }))
                        }
                      >
                        {!prompt.required && <option value="" />}
                        {prompt.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={values[prompt.name] ?? prompt.defaultValue}
                        maxLength={prompt.maxLength}
                        required={prompt.required}
                        pattern={prompt.pattern || undefined}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [prompt.name]: event.target.value
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
              </fieldset>
            )}
            {source ? (
              <fieldset>
                <legend>Data records</legend>
                <RecordPicker
                  source={source}
                  documentPath={useDocumentStore.getState().filePath}
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedKeys}
                  onData={receiveSourceData}
                  compact
                />
              </fieldset>
            ) : null}
            {check('monochrome', 'Print in grayscale / monochrome')}
            <fieldset>
              <legend>Page Sizing &amp; Handling</legend>
              {(
                [
                  ['fit', 'Fit'],
                  ['actual', 'Actual size'],
                  ['shrink', 'Shrink oversized'],
                  ['custom', 'Custom scale']
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="sizing"
                    checked={settings.sizing === value}
                    onChange={() => update({ sizing: value })}
                  />
                  {label}
                </label>
              ))}
              {settings.sizing === 'custom' && numeric('customScale', 'Scale (%)', 1, 1000)}
              {check('chooseLabelPaper', 'Choose paper size by label size')}
              {!settings.chooseLabelPaper && (
                <>
                  <div className="geometry-fields">
                    {numeric('paperWidthMm', 'Paper width (mm)', 1, 2000, 0.1)}
                    {numeric('paperHeightMm', 'Paper height (mm)', 1, 2000, 0.1)}
                  </div>
                  {numeric('marginMm', 'Estimated margin (mm)', 0, 100, 0.1)}
                </>
              )}
            </fieldset>
            <fieldset>
              <legend>Orientation</legend>
              <div style={{ display: 'flex', gap: 12 }}>
                {(['auto', 'portrait', 'landscape'] as const).map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="orientation"
                      checked={settings.orientation === v}
                      onChange={() => update({ orientation: v })}
                    />
                    {v[0]!.toUpperCase() + v.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Calibration offset</legend>
              <div className="geometry-fields">
                {numeric('offsetX', 'X offset (mm)', -10, 10, 0.1)}
                {numeric('offsetY', 'Y offset (mm)', -10, 10, 0.1)}
              </div>
            </fieldset>
          </div>
          <div className="print-preview">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                disabled={recordIndex === 0}
                onClick={() => setRecordIndex((index) => index - 1)}
              >
                Previous
              </Button>
              <span>
                Record {recordCount ? safeRecordIndex + 1 : 0} of {recordCount}
              </span>
              <Button
                disabled={safeRecordIndex + 1 >= recordCount}
                onClick={() => setRecordIndex((index) => index + 1)}
              >
                Next
              </Button>
            </div>
            {counters[0] && (
              <small>
                Serial {formatCounter(counters[0], counterValue(counters[0], recordIndex))}
              </small>
            )}
            <section aria-label="Print preflight summary" style={{ width: '100%' }}>
              <strong>
                Preflight: {currentPreflight.errors} errors · {currentPreflight.warnings} warnings
              </strong>
              {batchReport && selectedRecords.length > 0 ? (
                <small style={{ display: 'block' }}>
                  Batch: {batchReport.rowsWithErrors} of {batchReport.rows.length} rows have errors;{' '}
                  {batchReport.rowsWithWarnings} have warnings.
                </small>
              ) : null}
              {currentPreflight.issues.slice(0, 3).map((item, index) => (
                <small
                  key={`${item.code}:${item.objectId ?? ''}:${index}`}
                  style={{ display: 'block' }}
                >
                  {item.severity.toUpperCase()}: {item.message}
                </small>
              ))}
              {batchReport?.rows
                .filter((row) => row.errors > 0)
                .slice(0, 3)
                .map((row) => (
                  <small key={row.key} style={{ display: 'block' }}>
                    Row {row.key}: {row.errors} errors — {row.issues[0]?.message}
                  </small>
                ))}
            </section>
            {layout && preview ? (
              <>
                <div
                  className="print-paper"
                  style={{
                    width: Math.min(380, (380 * layout.width) / layout.height),
                    aspectRatio: `${layout.width}/${layout.height}`
                  }}
                >
                  <img src={preview} alt="Print preview" />
                  <div
                    className="print-printable"
                    style={{
                      inset: `${(layout.margin / layout.height) * 100}% ${(layout.margin / layout.width) * 100}%`
                    }}
                  />
                </div>
                <strong>
                  {layout.width.toFixed(2)} × {layout.height.toFixed(2)} mm ·{' '}
                  {(layout.scale * 100).toFixed(1)}%
                </strong>
                <small>
                  {printerId === 'Microsoft Print to PDF'
                    ? settings.printMethod === 'gdi'
                      ? 'Uses the native PDF driver; it may substitute unsupported custom media.'
                      : 'Saves an exact-size PDF using the label renderer.'
                    : 'Printable area is estimated. The driver may impose hardware margins.'}
                </small>
              </>
            ) : (
              <p>Preparing preview…</p>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" style={{ color: '#b10e1e' }}>
            {error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => useUiStore.getState().setLabelSetupOpen(true)}>
          Page Setup…
        </Button>
        <Button disabled={busy} onClick={() => useUiStore.getState().setPrintDialogOpen(false)}>
          Cancel
        </Button>
        <Button
          appearance="primary"
          disabled={
            busy ||
            !printerId ||
            !preview ||
            !!error ||
            !layout ||
            strictBlocked ||
            (source ? !recordCount : false)
          }
          onClick={() => void print()}
        >
          {busy ? 'Printing…' : 'Print'}
        </Button>
      </DialogActions>
    </DialogBody>
  )
}
