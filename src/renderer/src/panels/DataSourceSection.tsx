/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { JSX } from 'react'
import type { LabelVariable } from '@shared/template/types'
import { useDocumentStore } from '../store'
import { PanelSection } from '../components/PanelSection'
import {
  applyDataSource,
  classifyDataSource,
  dataSourcePreview,
  variablesForSource,
  type DataSource
} from '../editor/dataSource'
import { objectExpression } from '../editor/variableActions'

const SOURCES: readonly { value: DataSource; label: string }[] = [
  { value: 'fixed', label: 'Fixed text' },
  { value: 'variable', label: 'Variable' },
  { value: 'prompt', label: 'Prompt at print' },
  { value: 'counter', label: 'Counter' },
  { value: 'field', label: 'Spreadsheet field' }
]

/**
 * A view over `template.variables` for one object: it reads the object's data
 * expression, names the source behind it and rewrites it when the operator
 * picks another one. The document format is untouched — the object still
 * stores a plain expression string.
 */
export function DataSourceSection({ objectId }: { objectId: string }): JSX.Element | null {
  const document = useDocumentStore((state) => state.document)
  const object = document.template.design.objects.find((candidate) => candidate.id === objectId)
  const expression = object ? objectExpression(object) : null
  if (!object || expression === null) return null

  const variables = document.template.variables
  const { state, variable } = classifyDataSource(expression, variables)
  // The sources that bind a variable; `fixed` and `custom` bind none.
  const bound: DataSource | null = state === 'custom' || state === 'fixed' ? null : state
  const candidates = bound ? variablesForSource(bound, variables) : []

  const choose = (source: DataSource, variableName?: string): void =>
    useDocumentStore
      .getState()
      .change((current) => applyDataSource(current, objectId, { source, variableName }))
  const updateVariable = (patch: Record<string, unknown>): void => {
    if (!variable) return
    useDocumentStore.getState().change((current) => ({
      ...current,
      template: {
        ...current.template,
        variables: current.template.variables.map((candidate) =>
          candidate.id === variable.id ? ({ ...candidate, ...patch } as LabelVariable) : candidate
        )
      }
    }))
  }

  const text = (key: string, label: string, value: string): JSX.Element => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => updateVariable({ [key]: event.target.value })}
      />
    </label>
  )
  const number = (
    key: string,
    label: string,
    value: number,
    min: number,
    max: number
  ): JSX.Element => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) =>
          Number.isFinite(event.target.valueAsNumber) &&
          updateVariable({ [key]: Math.min(Math.max(event.target.valueAsNumber, min), max) })
        }
      />
    </label>
  )

  return (
    <PanelSection id="object-data-source" title="Data source" collapsible>
      <label>
        Object data source
        <select
          aria-label="Object data source"
          value={state}
          onChange={(event) => {
            const next = event.target.value
            if (next !== 'custom') choose(next as DataSource)
          }}
        >
          {state === 'custom' ? <option value="custom">Custom expression</option> : null}
          {SOURCES.map((source) => (
            <option
              key={source.value}
              value={source.value}
              disabled={
                source.value === 'variable' &&
                variablesForSource('variable', variables).length === 0
              }
            >
              {source.label}
            </option>
          ))}
        </select>
      </label>
      {state === 'custom' ? (
        <small>
          This value mixes text and variables. Choosing a source replaces the whole expression.
        </small>
      ) : null}
      {state === 'fixed' ? <small>The value is typed directly in the field above.</small> : null}
      {state === 'fixed' ? (
        <small>Fixed text unbinds this object, keeping the previewed value.</small>
      ) : null}
      {bound && candidates.length ? (
        <label>
          Source variable
          <select
            aria-label="Source variable"
            value={variable?.name ?? ''}
            onChange={(event) => choose(bound, event.target.value)}
          >
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.name}>
                {candidate.name} · {candidate.kind}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {variable?.kind === 'prompt' ? (
        <>
          {text('label', 'Prompt message', variable.label)}
          {text('defaultValue', 'Default value', variable.defaultValue)}
          <label>
            <input
              aria-label="Answer required"
              type="checkbox"
              checked={variable.required}
              onChange={(event) => updateVariable({ required: event.target.checked })}
            />
            Answer required
          </label>
        </>
      ) : null}
      {variable?.kind === 'counter' ? (
        <div className="geometry-fields">
          {number('start', 'Counter start', variable.start, -1000000000, 1000000000)}
          {number('step', 'Counter step', variable.step, -1000000, 1000000)}
          {number('padding', 'Counter padding', variable.padding, 0, 32)}
          {text('padChar', 'Counter pad character', variable.padChar)}
          {text('prefix', 'Counter prefix', variable.prefix)}
          {text('suffix', 'Counter suffix', variable.suffix)}
        </div>
      ) : null}
      {variable?.kind === 'field' ? (
        <>
          {text('column', 'Spreadsheet column', variable.column)}
          {text('sampleValue', 'Sample field value', variable.sampleValue)}
        </>
      ) : null}
      {state === 'variable' && variable ? (
        <small>
          {variable.name} is a {variable.kind} variable. Edit its settings in the Variables panel.
        </small>
      ) : null}
      <small>Preview: {dataSourcePreview(expression, variables) || '—'}</small>
    </PanelSection>
  )
}
