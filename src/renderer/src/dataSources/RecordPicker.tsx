/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { Button } from '@fluentui/react-components'
import type {
  DataSourceReadResult,
  DataSourceRecord,
  RecordPickerFilter
} from '@shared/dataSources'
import { recordMatchesFilter } from '@shared/dataSources'
import type { DataSourceDefinition } from '@shared/template/types'
import { useUiStore } from '../store'

interface RecordPickerProps {
  source: DataSourceDefinition
  documentPath: string | null
  selectedKeys: readonly string[]
  onSelectionChange: (keys: string[]) => void
  onData?: (data: DataSourceReadResult | null) => void
  compact?: boolean
}

export function RecordPicker({
  source,
  documentPath,
  selectedKeys,
  onSelectionChange,
  onData,
  compact = false
}: RecordPickerProps): JSX.Element {
  const [data, setData] = useState<DataSourceReadResult | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<RecordPickerFilter>('all')
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voidingKey, setVoidingKey] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    const result = await window.barista.invoke('dataSource:read', { source, documentPath })
    if (result.ok) {
      setData(result.value)
      onData?.(result.value)
      setError('')
      setStale(false)
    } else {
      setData(null)
      onData?.(null)
      setError(result.error.message)
    }
    setBusy(false)
  }, [documentPath, onData, source])

  useEffect(() => {
    const initialLoad = setTimeout(() => void load(), 0)
    void window.barista.invoke('dataSource:watch', { source, documentPath })
    const unsubscribe = window.barista.on('dataSource:changed', (event) => {
      if (event.sourceId === source.id) setStale(true)
    })
    return () => {
      clearTimeout(initialLoad)
      unsubscribe()
      void window.barista.invoke('dataSource:unwatch', { sourceId: source.id })
    }
  }, [documentPath, load, source])

  const keyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of data?.records ?? [])
      counts.set(record.key, (counts.get(record.key) ?? 0) + 1)
    return counts
  }, [data])
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return (data?.records ?? []).filter(
      (record) =>
        recordMatchesFilter(record, filter) &&
        (!query ||
          record.key.toLocaleLowerCase().includes(query) ||
          Object.values(record.values).some((value) => value.toLocaleLowerCase().includes(query)))
    )
  }, [data, filter, search])
  const validVisible = visible.filter((record) => record.key && keyCounts.get(record.key) === 1)
  const toggle = (record: DataSourceRecord): void => {
    if (!record.key || keyCounts.get(record.key) !== 1) return
    onSelectionChange(
      selectedKeys.includes(record.key)
        ? selectedKeys.filter((key) => key !== record.key)
        : [...selectedKeys, record.key]
    )
  }

  return (
    <section className={`record-picker ${compact ? 'compact' : ''}`} data-source-id={source.id}>
      <div className="record-picker-toolbar">
        <input
          aria-label="Search records"
          placeholder="Search records"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Tracking filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as RecordPickerFilter)}
        >
          <option value="all">All</option>
          <option value="unprinted">Only unprinted</option>
          <option value="changed">Only changed</option>
        </select>
        <Button disabled={busy} onClick={() => void load()}>
          Reload
        </Button>
      </div>
      {stale ? (
        <p role="status" className="data-source-changed">
          The source file changed. <button onClick={() => void load()}>Reload now</button>
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {data?.warnings.map((warning) => (
        <p role="alert" key={warning}>
          {warning}
        </p>
      ))}
      {data ? (
        <div className="record-table-wrap">
          <table className="record-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select visible records"
                    checked={
                      validVisible.length > 0 &&
                      validVisible.every((record) => selectedKeys.includes(record.key))
                    }
                    onChange={(event) =>
                      onSelectionChange(
                        event.target.checked
                          ? [
                              ...new Set([
                                ...selectedKeys,
                                ...validVisible.map((record) => record.key)
                              ])
                            ]
                          : selectedKeys.filter(
                              (key) => !validVisible.some((record) => record.key === key)
                            )
                      )
                    }
                  />
                </th>
                <th>Status</th>
                {data.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((record, index) => {
                const invalid = !record.key || keyCounts.get(record.key) !== 1
                return (
                  <tr key={`${record.key}:${index}`} className={invalid ? 'invalid-record' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${record.key || `row ${index + 1}`}`}
                        disabled={invalid}
                        checked={selectedKeys.includes(record.key)}
                        onChange={() => toggle(record)}
                      />
                    </td>
                    <td>
                      {record.status.replace('-', ' ')}
                      {record.changed ? ' · changed' : ''}
                    </td>
                    {data.columns.map((column) => (
                      <td key={column}>{record.values[column]}</td>
                    ))}
                    <td>
                      <Button
                        size="small"
                        onClick={() => useUiStore.getState().setPreviewFields(record.values)}
                      >
                        Preview
                      </Button>
                      {record.status !== 'never-printed' && voidingKey !== record.key ? (
                        <Button
                          size="small"
                          onClick={() => {
                            setVoidingKey(record.key)
                            setVoidReason('')
                          }}
                        >
                          Void
                        </Button>
                      ) : null}
                      {voidingKey === record.key ? (
                        <span className="void-record-form">
                          <input
                            aria-label={`Void reason for ${record.key}`}
                            placeholder="Reason required"
                            value={voidReason}
                            onChange={(event) => setVoidReason(event.target.value)}
                          />
                          <Button
                            size="small"
                            disabled={!voidReason.trim()}
                            onClick={async () => {
                              const result = await window.barista.invoke('dataSource:void', {
                                dataSourceId: source.id,
                                recordKey: record.key,
                                reason: voidReason
                              })
                              if (result.ok) {
                                setVoidingKey(null)
                                setVoidReason('')
                                void load()
                              } else setError(result.error.message)
                            }}
                          >
                            Confirm void
                          </Button>
                          <Button size="small" onClick={() => setVoidingKey(null)}>
                            Cancel
                          </Button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : busy ? (
        <p>Reading records…</p>
      ) : null}
    </section>
  )
}
