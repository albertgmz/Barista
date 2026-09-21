/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useMemo, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle
} from '@fluentui/react-components'
import { GS1_APPLICATION_IDENTIFIERS, gs1AiDefinition } from '@shared/gs1ApplicationIdentifiers'
import { buildGs1, gs1Template, normalizeGs1Value } from '@shared/gs1'
import type { LabelObject } from '@shared/template/types'
import { evaluateTemplate, evaluateVariables } from '@shared/variables'
import { useDocumentStore, useEditorStore, useUiStore } from '../store'

type Carrier = 'gs1-128' | 'gs1datamatrix' | 'gs1qrcode'
interface BuilderRow {
  id: string
  ai: string
  mode: 'fixed' | 'variable'
  value: string
}

let rowSequence = 0
const newRow = (ai = '01'): BuilderRow => ({
  id: `gs1-row-${++rowSequence}`,
  ai,
  mode: 'fixed',
  value: ''
})

function replaceWithGs1(object: LabelObject, carrier: Carrier, data: string): LabelObject {
  const base = {
    id: object.id,
    name: object.name,
    xMm: object.xMm,
    yMm: object.yMm,
    widthMm: object.widthMm,
    heightMm: object.heightMm,
    rotation: object.rotation,
    locked: object.locked,
    visible: object.visible,
    zIndex: object.zIndex,
    ...(object.groupId ? { groupId: object.groupId } : {})
  }
  if (carrier === 'gs1-128')
    return {
      ...base,
      kind: 'barcode',
      symbology: carrier,
      data,
      moduleWidthMm: object.kind === 'barcode' ? object.moduleWidthMm : 0.254,
      barHeightMm:
        object.kind === 'barcode' ? object.barHeightMm : Math.max(8, object.heightMm - 3),
      quietZoneMm: object.kind === 'barcode' ? object.quietZoneMm : 2.54,
      showHumanReadable: true,
      humanReadableFontSizePt: object.kind === 'barcode' ? object.humanReadableFontSizePt : 8,
      addCheckDigit: false,
      color: '#000000'
    }
  return {
    ...base,
    kind: 'qrcode',
    symbology: carrier,
    data,
    errorCorrection: object.kind === 'qrcode' ? object.errorCorrection : 'M',
    moduleSizeMm: object.kind === 'qrcode' ? object.moduleSizeMm : 0.508,
    quietZoneModules: object.kind === 'qrcode' ? object.quietZoneModules : 4,
    color: '#000000'
  }
}

export function Gs1BuilderDialog(): JSX.Element {
  const open = useUiStore((state) => state.isGs1BuilderOpen)
  const document = useDocumentStore((state) => state.document)
  const objectId = useEditorStore((state) => state.selectedIds[0])
  const object = document.template.design.objects.find((item) => item.id === objectId)
  const variables = document.template.variables
  const [carrier, setCarrier] = useState<Carrier>(
    object?.kind === 'qrcode' &&
      (object.symbology === 'gs1datamatrix' || object.symbology === 'gs1qrcode')
      ? object.symbology
      : 'gs1-128'
  )
  const [rows, setRows] = useState<BuilderRow[]>([newRow('01')])
  const sampleValues = useMemo(
    () => evaluateVariables(variables, { sample: true }).values,
    [variables]
  )
  const preview = useMemo(() => {
    try {
      return {
        result: buildGs1(
          rows.map((row) => ({
            ai: row.ai,
            value:
              row.mode === 'variable'
                ? evaluateTemplate(`{${row.value}}`, sampleValues).value
                : row.value
          }))
        ),
        error: ''
      }
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [rows, sampleValues])
  const update = (id: string, patch: Partial<BuilderRow>): void =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => useUiStore.getState().setGs1BuilderOpen(data.open)}
    >
      <DialogSurface className="gs1-builder-dialog">
        <DialogBody>
          <DialogTitle>GS1 builder</DialogTitle>
          <DialogContent>
            <label>
              Carrier
              <select
                aria-label="GS1 carrier"
                value={carrier}
                onChange={(event) => setCarrier(event.target.value as Carrier)}
              >
                <option value="gs1-128">GS1-128</option>
                <option value="gs1datamatrix">GS1 DataMatrix</option>
                <option value="gs1qrcode">GS1 QR</option>
              </select>
            </label>
            <datalist id="gs1-ai-list">
              {GS1_APPLICATION_IDENTIFIERS.map((definition) => (
                <option key={definition.ai} value={definition.ai}>
                  {definition.title}
                </option>
              ))}
            </datalist>
            <div className="gs1-builder-rows">
              {rows.map((row) => {
                const definition = gs1AiDefinition(row.ai)
                return (
                  <div className="gs1-builder-row" key={row.id}>
                    <label>
                      Application Identifier
                      <input
                        aria-label="Application Identifier"
                        list="gs1-ai-list"
                        value={row.ai}
                        onChange={(event) => update(row.id, { ai: event.target.value })}
                      />
                    </label>
                    <label>
                      Value source
                      <select
                        aria-label={`Value source for ${row.ai}`}
                        value={row.mode}
                        onChange={(event) =>
                          update(row.id, {
                            mode: event.target.value as BuilderRow['mode'],
                            value: ''
                          })
                        }
                      >
                        <option value="fixed">Fixed value</option>
                        <option value="variable">Variable</option>
                      </select>
                    </label>
                    {row.mode === 'fixed' ? (
                      <label>
                        Value
                        <input
                          aria-label={`Value for ${row.ai}`}
                          value={row.value}
                          onChange={(event) => update(row.id, { value: event.target.value })}
                        />
                      </label>
                    ) : (
                      <label>
                        Variable
                        <select
                          aria-label={`Variable for ${row.ai}`}
                          value={row.value}
                          onChange={(event) => update(row.id, { value: event.target.value })}
                        >
                          <option value="">Choose…</option>
                          {variables.map((variable) => (
                            <option key={variable.id} value={variable.name}>
                              {variable.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <span className="gs1-ai-description">
                      {definition
                        ? `${definition.title} · ${definition.fixedLength ? definition.minLength : `${definition.minLength}–${definition.maxLength}`} ${definition.characterSet}`
                        : 'Unknown AI'}
                    </span>
                    <Button
                      disabled={rows.length === 1}
                      onClick={() =>
                        setRows((current) => current.filter((item) => item.id !== row.id))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                )
              })}
            </div>
            <Button onClick={() => setRows((current) => [...current, newRow('10')])}>Add AI</Button>
            {preview.error ? (
              <p role="alert">{preview.error}</p>
            ) : (
              <div className="gs1-preview">
                <strong>Human readable</strong>
                <code>{preview.result!.humanReadable}</code>
                <small>
                  Group separators:{' '}
                  {
                    [...preview.result!.encoded].filter((character) => character === '\u001d')
                      .length
                  }
                </small>
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => useUiStore.getState().setGs1BuilderOpen(false)}>Cancel</Button>
            <Button
              appearance="primary"
              disabled={!object || !preview.result}
              onClick={() => {
                if (!object) return
                const elements = rows.map((row) => ({
                  ai: row.ai.trim(),
                  value:
                    row.mode === 'variable'
                      ? `{${row.value}}`
                      : normalizeGs1Value(row.ai.trim(), row.value)
                }))
                const data = gs1Template(elements)
                useDocumentStore.getState().change((current) => ({
                  ...current,
                  template: {
                    ...current.template,
                    design: {
                      ...current.template.design,
                      objects: current.template.design.objects.map((item) =>
                        item.id === object.id ? replaceWithGs1(item, carrier, data) : item
                      )
                    }
                  }
                }))
                useUiStore.getState().setGs1BuilderOpen(false)
              }}
            >
              Apply
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
