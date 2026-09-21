/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useRef, useState, type JSX } from 'react'
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
import { Add16Regular, BracesVariable24Regular, Delete16Regular } from '@fluentui/react-icons'
import type { LabelVariable, VariableKind } from '@shared/template/types'
import { analyzeVariableUsage, evaluateVariables } from '@shared/variables'
import { useDocumentStore } from '../store'
import { EmptyState } from '../components/EmptyState'
import { TemplateField } from '../components/TemplateField'
import {
  createQuickVariable,
  createVariable,
  type QuickVariablePreset
} from '../editor/variableActions'
import { variableTint } from '../editor/variableColor'

export function VariablesPanel(): JSX.Element {
  const document = useDocumentStore((state) => state.document)
  const variables = document.template.variables
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newKind, setNewKind] = useState<VariableKind>('prompt')
  const [quickPreset, setQuickPreset] = useState('')
  const [addedId, setAddedId] = useState<string | null>(null)
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [requestedName, setRequestedName] = useState('')
  const nameResolver = useRef<((name: string | null) => void) | null>(null)
  const selected = variables.find((variable) => variable.id === selectedId) ?? null
  const sample = evaluateVariables(variables, { sample: true })
  const usage = analyzeVariableUsage(document)
  // Derived from the document the store holds rather than from this render, so
  // that creating and then editing a variable in one gesture cannot drop it.
  const change = (next: (current: readonly LabelVariable[]) => LabelVariable[]): void =>
    useDocumentStore.getState().change((document) => ({
      ...document,
      template: { ...document.template, variables: next(document.template.variables) }
    }))
  const update = (patch: Record<string, unknown>): void => {
    if (selected)
      change((current) =>
        current.map((variable) =>
          variable.id === selected.id ? ({ ...variable, ...patch } as LabelVariable) : variable
        )
      )
  }
  // Adding leaves the new variable collapsed; the list row opens it on click.
  const add = (variable: LabelVariable): void => {
    change((current) => [...current, variable])
    setAddedId(variable.id)
  }
  useEffect(() => {
    if (!addedId) return
    const row = globalThis.document.getElementById(`variable-${addedId}`)
    row?.scrollIntoView({ block: 'nearest' })
    const clear = window.setTimeout(() => setAddedId(null), 1600)
    return () => window.clearTimeout(clear)
  }, [addedId, variables.length])
  const addQuick = (preset: QuickVariablePreset): void => {
    const option = preset === 'future-date' ? 30 : preset === 'excel' ? 'Column' : undefined
    add(
      createQuickVariable(
        preset,
        variables.map((item) => item.name),
        option
      )
    )
  }
  const requestVariableName = (): Promise<string | null> => {
    setRequestedName('')
    setNameDialogOpen(true)
    return new Promise((resolve) => {
      nameResolver.current = resolve
    })
  }
  const finishNameDialog = (name: string | null): void => {
    const resolve = nameResolver.current
    nameResolver.current = null
    setNameDialogOpen(false)
    resolve?.(name)
  }
  const createRequestedVariable = (): void => {
    const requested = requestedName.trim()
    if (!requested) return
    const variable = createVariable(
      'prompt',
      useDocumentStore.getState().document.template.variables.map((item) => item.name),
      requested
    )
    add(variable)
    finishNameDialog(variable.name)
  }
  const text = (key: string, label: string, value: string): JSX.Element => (
    <label>
      {label}
      <input
        value={value}
        onChange={(event) =>
          update({
            [key]:
              key === 'options'
                ? event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                : event.target.value
          })
        }
      />
    </label>
  )
  const number = (key: string, label: string, value: number): JSX.Element => (
    <label>
      {label}
      <input
        type="number"
        value={value}
        min={key === 'padding' ? 0 : undefined}
        max={key === 'padding' ? 32 : undefined}
        onChange={(event) =>
          Number.isFinite(event.target.valueAsNumber) &&
          update({
            [key]:
              key === 'padding'
                ? Math.min(Math.max(event.target.valueAsNumber, 0), 32)
                : event.target.valueAsNumber
          })
        }
      />
    </label>
  )
  const select = (key: string, label: string, value: string, options: string[]): JSX.Element => (
    <label>
      {label}
      <select value={value} onChange={(event) => update({ [key]: event.target.value })}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  )
  return (
    <div className="document-properties variables-panel">
      <Dialog
        open={nameDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) finishNameDialog(null)
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>New variable</DialogTitle>
            <DialogContent>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  createRequestedVariable()
                }}
              >
                <label>
                  Variable name
                  <Input
                    aria-label="Variable name"
                    autoFocus
                    value={requestedName}
                    onChange={(_, data) => setRequestedName(data.value)}
                  />
                </label>
              </form>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => finishNameDialog(null)}>Cancel</Button>
              <Button appearance="primary" onClick={createRequestedVariable}>
                Create
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          value={newKind}
          onChange={(event) => setNewKind(event.target.value as VariableKind)}
        >
          <option value="fixed">Fixed</option>
          <option value="prompt">Prompt</option>
          <option value="counter">Counter</option>
          <option value="datetime">Date/time</option>
          <option value="formula">Formula</option>
          <option value="field">Excel field</option>
        </select>
        <Button
          icon={<Add16Regular />}
          onClick={() => {
            add(
              createVariable(
                newKind,
                variables.map((item) => item.name)
              )
            )
          }}
        >
          Add
        </Button>
      </div>
      <label>
        Quick create
        <select
          aria-label="Quick create variable"
          value={quickPreset}
          onChange={(event) => {
            const preset = event.currentTarget.value as QuickVariablePreset
            setQuickPreset(preset)
            if (preset) addQuick(preset)
            setTimeout(() => setQuickPreset(''), 0)
          }}
        >
          <option value="">Choose…</option>
          <option value="today">Today's date</option>
          <option value="future-date">Date + N days</option>
          <option value="serial">Serial number</option>
          <option value="operator">Operator prompt</option>
          <option value="excel">Excel column</option>
        </select>
      </label>
      {usage.undefined.length ? <p role="alert">Undefined: {usage.undefined.join(', ')}</p> : null}
      {sample.errors.map((error) => (
        <p role="alert" key={error}>
          {error}
        </p>
      ))}
      {!variables.length ? (
        <EmptyState
          icon={<BracesVariable24Regular />}
          title="No variables"
          description="Add prompts, counters, dates or fixed values for use in object templates."
        />
      ) : (
        <div className="variable-list" role="listbox" aria-label="Variables">
          {variables.map((variable) => (
            <button
              type="button"
              role="option"
              aria-selected={variable.id === selected?.id}
              id={`variable-${variable.id}`}
              key={variable.id}
              className={variable.id === addedId ? 'variable-added' : undefined}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copy'
                event.dataTransfer.setData('application/x-barista-variable', variable.name)
                event.dataTransfer.setData('text/plain', `{${variable.name}}`)
              }}
              onClick={() => setSelectedId(variable.id)}
            >
              <span className="variable-label">
                <span className="variable-swatch" style={variableTint(variable.name)} aria-hidden />
                {variable.name} · {variable.kind}
              </span>
              {usage.unused.includes(variable.name) ? (
                <span className="variable-status">unused</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      {variables.length > 0 && !selected ? (
        <small className="variable-hint">Select a variable to edit its settings.</small>
      ) : null}
      {selected && (
        <>
          {text('name', 'Name', selected.name)}
          <small>
            Insert as <code>{`{${selected.name}}`}</code> · Sample:{' '}
            {sample.values[selected.name] ?? '—'}
          </small>
          {selected.kind === 'fixed' && text('value', 'Value', selected.value)}
          {selected.kind === 'prompt' && (
            <>
              {text('label', 'Prompt label', selected.label)}
              {text('defaultValue', 'Default / last value', selected.defaultValue)}
              {number('maxLength', 'Maximum length', selected.maxLength)}
              {text('pattern', 'Regular expression', selected.pattern)}
              {text('options', 'Dropdown values (comma-separated)', selected.options.join(', '))}
              <label>
                <input
                  type="checkbox"
                  checked={selected.required}
                  onChange={(event) => update({ required: event.target.checked })}
                />
                Required
              </label>
            </>
          )}
          {selected.kind === 'counter' && (
            <>
              <div className="geometry-fields">
                {number('start', 'Start', selected.start)}
                {number('step', 'Step', selected.step)}
                {number('min', 'Minimum', selected.min)}
                {number('max', 'Maximum', selected.max)}
                {number('padding', 'Width', selected.padding)}
              </div>
              {select('format', 'Format', selected.format, [
                'numeric',
                'alphanumeric',
                'hex',
                'custom'
              ])}
              {selected.format === 'custom' &&
                text('alphabet', 'Custom alphabet', selected.alphabet)}
              {text('padChar', 'Padding character', selected.padChar)}
              {text('prefix', 'Prefix', selected.prefix)}
              {text('suffix', 'Suffix', selected.suffix)}
              {select('scope', 'Scope', selected.scope, ['template', 'global'])}
              {selected.scope === 'global' &&
                text('sharedName', 'Shared counter name', selected.sharedName)}
              {select('overflow', 'At limit', selected.overflow, ['stop', 'wrap'])}
              {select('reset', 'Reset', selected.reset, ['never', 'daily', 'monthly', 'yearly'])}
              {select('failure', 'Failed print', selected.failure, ['void', 'release'])}
            </>
          )}
          {selected.kind === 'datetime' && (
            <>
              {text('format', 'Format', selected.format)}
              <div className="geometry-fields">
                {number('offsetDays', 'Days offset', selected.offsetDays)}
                {number('offsetMonths', 'Months offset', selected.offsetMonths)}
                {number('offsetYears', 'Years offset', selected.offsetYears)}
              </div>
            </>
          )}
          {selected.kind === 'formula' && (
            <TemplateField
              label="Template expression"
              value={selected.expression}
              variables={variables}
              onChange={(value) => update({ expression: value })}
              onCreateVariable={requestVariableName}
            />
          )}
          {selected.kind === 'field' && (
            <>
              {text('column', 'Excel column', selected.column)}
              {text('sampleValue', 'Sample value', selected.sampleValue)}
            </>
          )}
          <Button
            icon={<Delete16Regular />}
            onClick={() => {
              change((current) => current.filter((variable) => variable.id !== selected.id))
              setSelectedId(null)
            }}
          >
            Delete variable
          </Button>
        </>
      )}
    </div>
  )
}
