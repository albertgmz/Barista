/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle
} from '@fluentui/react-components'
import { newId } from '@shared/template/document'
import type { WorkbookSourceInfo } from '@shared/dataSources'
import type { DataSourceDefinition, FieldVariable } from '@shared/template/types'
import { useDocumentStore, useUiStore } from '../store'
import { uniqueVariableName } from '../editor/variableActions'
import { RecordPicker } from './RecordPicker'

function blankSource(): DataSourceDefinition {
  return {
    id: newId(),
    name: 'Equipment data',
    path: '',
    selection: { kind: 'sheet', name: '' },
    headerRow: 1,
    keyColumn: '',
    filter: null,
    mappings: [],
    writeStatusColumn: false
  }
}

export function DataSourceDialog(): JSX.Element {
  const open = useUiStore((state) => state.isDataSourceOpen)
  const document = useDocumentStore((state) => state.document)
  const documentPath = useDocumentStore((state) => state.filePath)
  const [sources, setSources] = useState<DataSourceDefinition[]>(() =>
    document.template.dataSources.length
      ? structuredClone(document.template.dataSources)
      : [blankSource()]
  )
  const [selectedId, setSelectedId] = useState(sources[0]!.id)
  const [info, setInfo] = useState<WorkbookSourceInfo | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [error, setError] = useState('')
  const selected = sources.find((source) => source.id === selectedId) ?? sources[0]!
  const fieldVariables = document.template.variables.filter(
    (variable): variable is FieldVariable => variable.kind === 'field'
  )
  const update = (patch: Partial<DataSourceDefinition>): void =>
    setSources((current) =>
      current.map((source) => (source.id === selected.id ? { ...source, ...patch } : source))
    )

  const inspect = useCallback(
    async (source: DataSourceDefinition): Promise<void> => {
      if (!source.path) return
      const result = await window.barista.invoke('dataSource:inspect', {
        path: source.path,
        documentPath
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setInfo(result.value)
      setError('')
    },
    [documentPath]
  )

  useEffect(() => {
    const timer = setTimeout(() => void inspect(selected), 0)
    return () => clearTimeout(timer)
  }, [inspect, selected])
  useEffect(() => {
    if (!selected.path || !selected.selection.name) return
    let active = true
    void window.barista
      .invoke('dataSource:headers', {
        path: selected.path,
        documentPath,
        selection: selected.selection,
        headerRow: selected.headerRow
      })
      .then((result) => {
        if (!active) return
        if (result.ok) {
          setColumns(result.value)
          if (!result.value.includes(selected.keyColumn))
            setSources((current) =>
              current.map((source) =>
                source.id === selected.id ? { ...source, keyColumn: result.value[0] ?? '' } : source
              )
            )
          setError('')
        } else setError(result.error.message)
      })
    return () => {
      active = false
    }
  }, [documentPath, selected])

  const selectionValue = `${selected.selection.kind}:${selected.selection.name}`
  const variableNames = useMemo(
    () => document.template.variables.map((variable) => variable.name),
    [document.template.variables]
  )
  const mapAll = (): void => {
    const names = [...variableNames]
    const mappings = columns.map((column) => {
      const existing = fieldVariables.find((variable) => variable.column === column)
      if (existing) return { column, variable: existing.name }
      const variable = uniqueVariableName(column, names)
      names.push(variable)
      return { column, variable }
    })
    update({ mappings })
  }
  const canPreview = !!selected.path && !!selected.selection.name && !!selected.keyColumn

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => useUiStore.getState().setDataSourceOpen(data.open)}
    >
      <DialogSurface className="data-source-dialog">
        <DialogBody>
          <DialogTitle>Excel data sources</DialogTitle>
          <DialogContent>
            <div className="data-source-toolbar">
              <select
                aria-label="Data source"
                value={selected.id}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => {
                  const source = blankSource()
                  setSources((current) => [...current, source])
                  setSelectedId(source.id)
                  setInfo(null)
                  setColumns([])
                }}
              >
                Add source
              </Button>
              <Button
                disabled={sources.length === 1}
                onClick={() => {
                  const remaining = sources.filter((source) => source.id !== selected.id)
                  setSources(remaining)
                  setSelectedId(remaining[0]!.id)
                }}
              >
                Delete
              </Button>
            </div>
            <div className="data-source-fields">
              <label>
                Name
                <input
                  value={selected.name}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </label>
              <label className="data-source-path">
                File
                <span>
                  <input
                    aria-label="Data source file"
                    value={selected.path}
                    onChange={(event) => update({ path: event.target.value })}
                  />
                  <Button
                    onClick={async () => {
                      const result = await window.barista.invoke('dataSource:showOpenDialog')
                      if (!result.ok) setError(result.error.message)
                      else if (result.value) {
                        const next = { ...selected, path: result.value }
                        update({ path: result.value })
                        await inspect(next)
                      }
                    }}
                  >
                    Browse…
                  </Button>
                </span>
              </label>
              <label>
                Sheet or named table
                <select
                  aria-label="Sheet or named table"
                  value={selectionValue}
                  onChange={(event) => {
                    const [kind, ...name] = event.target.value.split(':')
                    update({ selection: { kind: kind as 'sheet' | 'table', name: name.join(':') } })
                  }}
                >
                  <option value="sheet:">Choose…</option>
                  {info?.sheets.map((sheet) => (
                    <option key={`sheet:${sheet}`} value={`sheet:${sheet}`}>
                      Sheet: {sheet}
                    </option>
                  ))}
                  {info?.tables.map((table) => (
                    <option key={`table:${table.name}`} value={`table:${table.name}`}>
                      Table: {table.name} ({table.sheet})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Header row
                <input
                  aria-label="Header row"
                  type="number"
                  min={1}
                  value={selected.headerRow}
                  disabled={selected.selection.kind === 'table'}
                  onChange={(event) =>
                    update({ headerRow: Math.max(1, event.target.valueAsNumber || 1) })
                  }
                />
              </label>
              <label>
                Unique key column
                <select
                  aria-label="Unique key column"
                  value={selected.keyColumn}
                  onChange={(event) => update({ keyColumn: event.target.value })}
                >
                  <option value="">Choose…</option>
                  {columns.map((column) => (
                    <option key={column}>{column}</option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset>
              <legend>Optional filter</legend>
              <div className="geometry-fields">
                <select
                  aria-label="Filter column"
                  value={selected.filter?.column ?? ''}
                  onChange={(event) =>
                    update({
                      filter: event.target.value
                        ? { column: event.target.value, operator: 'contains', value: '' }
                        : null
                    })
                  }
                >
                  <option value="">No filter</option>
                  {columns.map((column) => (
                    <option key={column}>{column}</option>
                  ))}
                </select>
                {selected.filter ? (
                  <>
                    <select
                      aria-label="Filter operator"
                      value={selected.filter.operator}
                      onChange={(event) =>
                        update({
                          filter: {
                            ...selected.filter!,
                            operator: event.target.value as NonNullable<
                              DataSourceDefinition['filter']
                            >['operator']
                          }
                        })
                      }
                    >
                      <option value="contains">contains</option>
                      <option value="equals">equals</option>
                      <option value="not-equals">does not equal</option>
                      <option value="starts-with">starts with</option>
                    </select>
                    <input
                      aria-label="Filter value"
                      value={selected.filter.value}
                      onChange={(event) =>
                        update({ filter: { ...selected.filter!, value: event.target.value } })
                      }
                    />
                  </>
                ) : null}
              </div>
            </fieldset>
            <fieldset>
              <legend>Field → variable mapping</legend>
              <Button disabled={!columns.length} onClick={mapAll}>
                Map all fields
              </Button>
              <div className="mapping-grid">
                {columns.map((column) => {
                  const mapping = selected.mappings.find((item) => item.column === column)
                  return (
                    <label key={column}>
                      {column}
                      <select
                        value={mapping?.variable ?? ''}
                        onChange={(event) =>
                          update({
                            mappings: [
                              ...selected.mappings.filter((item) => item.column !== column),
                              ...(event.target.value
                                ? [{ column, variable: event.target.value }]
                                : [])
                            ]
                          })
                        }
                      >
                        <option value="">Not mapped</option>
                        {fieldVariables.map((variable) => (
                          <option key={variable.id}>{variable.name}</option>
                        ))}
                        {mapping &&
                        !fieldVariables.some((variable) => variable.name === mapping.variable) ? (
                          <option>{mapping.variable}</option>
                        ) : null}
                      </select>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <p>
              <small>Barista reads this file only. Status write-back is off and unavailable.</small>
            </p>
            {error ? <p role="alert">{error}</p> : null}
            {canPreview ? (
              <RecordPicker
                source={selected}
                documentPath={documentPath}
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              />
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => useUiStore.getState().setDataSourceOpen(false)}>Cancel</Button>
            <Button
              appearance="primary"
              disabled={sources.some(
                (source) =>
                  !source.name.trim() || !source.path || !source.selection.name || !source.keyColumn
              )}
              onClick={() => {
                const pending: FieldVariable[] = []
                const names = [...variableNames]
                for (const source of sources)
                  for (const mapping of source.mappings) {
                    if (
                      document.template.variables.some(
                        (variable) => variable.name === mapping.variable
                      ) ||
                      pending.some((variable) => variable.name === mapping.variable)
                    )
                      continue
                    names.push(mapping.variable)
                    pending.push({
                      id: newId(),
                      name: mapping.variable,
                      kind: 'field',
                      column: mapping.column,
                      sampleValue: ''
                    })
                  }
                useDocumentStore.getState().change((current) => ({
                  ...current,
                  template: {
                    ...current.template,
                    dataSources: sources,
                    variables: [
                      ...current.template.variables.map((variable) => {
                        if (variable.kind !== 'field') return variable
                        const mapping = sources
                          .flatMap((source) => source.mappings)
                          .find((item) => item.variable === variable.name)
                        return mapping ? { ...variable, column: mapping.column } : variable
                      }),
                      ...pending
                    ]
                  }
                }))
                useUiStore.getState().setDataSourceOpen(false)
              }}
            >
              Save
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
