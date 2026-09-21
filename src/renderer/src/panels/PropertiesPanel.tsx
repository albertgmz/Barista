/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { ObjectPatch } from '@shared/template/document'
import { bounds } from '@shared/template/document'
import { useDocumentStore, useEditorStore } from '../store'
import { MeasurementInput } from '../components/MeasurementInput'
import { alignToPrinterDot } from '@shared/units'
import { useUiStore } from '../store/uiStore'
import { evaluateTemplate, evaluateVariables } from '@shared/variables'
import { TemplateField } from '../components/TemplateField'
import { DataSourceSection } from './DataSourceSection'
import { createVariable } from '../editor/variableActions'
import { fitText } from '@shared/textFit'
import {
  BARCODE_SYMBOLOGIES,
  encoderMessage,
  isGs1Symbology,
  symbologyDataRule
} from '@shared/template/symbologies'
import { Button } from '@fluentui/react-components'
import { useFontStore } from '../store/fontStore'
import { applyFontFamily } from '../editor/fontActions'
import { canvasTextMeasurer } from '../editor/textMeasure'
const names: Record<string, string> = {
  xMm: 'X (mm)',
  yMm: 'Y (mm)',
  widthMm: 'Width (mm)',
  heightMm: 'Height (mm)',
  rotation: 'Rotation (°)',
  fontSizePt: 'Font size (pt)',
  strokeWidthMm: 'Stroke (mm)',
  cornerRadiusMm: 'Corner radius (mm)',
  moduleWidthMm: 'Module width (mm)',
  moduleSizeMm: 'Module size (mm)',
  barHeightMm: 'Bar height (mm)',
  quietZoneMm: 'Quiet zone (mm)',
  humanReadableFontSizePt: 'Readable text (pt)',
  minFontSizePt: 'Minimum font size (pt)',
  maxLines: 'Maximum lines'
}
export function PropertiesPanel(): JSX.Element {
  const d = useDocumentStore((s) => s.document),
    ids = useEditorStore((s) => s.selectedIds),
    objects = d.template.design.objects.filter((o) => ids.includes(o.id))
  const fonts = useFontStore((state) => state.catalog.families)
  const [barcodeErrors, setBarcodeErrors] = useState<Record<string, string | null>>({})
  useEffect(() => {
    const values = evaluateVariables(d.template.variables, { sample: true }).values
    const symbols = d.template.design.objects
      .filter((object) => ids.includes(object.id))
      .filter((object) => object.kind === 'barcode' || object.kind === 'qrcode')
      .map((object) => ({ ...object, data: evaluateTemplate(object.data, values).value }))
    if (!symbols.length) {
      setBarcodeErrors({})
      return
    }
    let active = true
    void import('@shared/render/barcode').then(({ barcodeError }) => {
      if (!active) return
      setBarcodeErrors(
        Object.fromEntries(symbols.map((object) => [object.id, barcodeError(object)]))
      )
    })
    return () => {
      active = false
    }
  }, [d.template.design.objects, d.template.variables, ids])
  const first = objects[0]
  const referencePoint = useEditorStore((state) => state.referencePoint)
  const shared = (key: string): unknown => {
    const value = first && (first as unknown as Record<string, unknown>)[key]
    return objects.every((o) => (o as unknown as Record<string, unknown>)[key] === value)
      ? value
      : undefined
  }
  const update = (key: string, value: unknown): void =>
    useDocumentStore.getState().updateObjects(ids, { [key]: value } as ObjectPatch)
  const updateMetadata = (patch: Partial<typeof d.template.metadata>): void =>
    useDocumentStore.getState().change((document) => ({
      ...document,
      template: {
        ...document.template,
        metadata: { ...document.template.metadata, ...patch }
      }
    }))
  const number = (key: string, min = -10000, max = 10000): JSX.Element => {
    const selectionBounds = objects.length ? bounds(objects) : null
    const isX = key === 'xMm'
    const isY = key === 'yMm'
    const value = isX
      ? selectionBounds && selectionBounds.x + selectionBounds.width * referencePoint.x
      : isY
        ? selectionBounds && selectionBounds.y + selectionBounds.height * referencePoint.y
        : shared(key) === undefined
          ? undefined
          : Number(shared(key))
    const percentBaseMm = ['xMm', 'widthMm'].includes(key)
      ? d.template.stock.widthMm
      : ['yMm', 'heightMm'].includes(key)
        ? d.template.stock.heightMm
        : undefined
    return (
      <MeasurementInput
        key={key}
        label={names[key] ?? key}
        value={value ?? undefined}
        min={min}
        max={max}
        percentBaseMm={percentBaseMm}
        physical={key !== 'rotation' && !key.endsWith('Pt')}
        onChange={(next) => {
          if ((isX || isY) && selectionBounds) {
            const current = isX
              ? selectionBounds.x + selectionBounds.width * referencePoint.x
              : selectionBounds.y + selectionBounds.height * referencePoint.y
            const delta = next - current
            useDocumentStore.getState().change((document) => ({
              ...document,
              template: {
                ...document.template,
                design: {
                  ...document.template.design,
                  objects: document.template.design.objects.map((object) =>
                    ids.includes(object.id) && !object.locked
                      ? {
                          ...object,
                          [isX ? 'xMm' : 'yMm']: object[isX ? 'xMm' : 'yMm'] + delta
                        }
                      : object
                  )
                }
              }
            }))
          } else {
            const adjusted =
              ['moduleWidthMm', 'moduleSizeMm'].includes(key) &&
              useUiStore.getState().preferences.snap.printerDots
                ? alignToPrinterDot(next, d.template.stock.dpi)
                : next
            update(key, adjusted)
          }
        }}
      />
    )
  }
  const select = (
    key: string,
    label: string,
    values: readonly (string | { value: string; label: string })[]
  ): JSX.Element => (
    <label>
      {label}
      <select
        aria-label={label}
        value={shared(key) === null ? 'none' : String(shared(key) ?? '')}
        onChange={(e) => update(key, e.target.value === 'none' ? null : e.target.value)}
      >
        <option value="" disabled>
          Mixed
        </option>
        {values.map((v) => {
          const option = typeof v === 'string' ? { value: v, label: v } : v
          return (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          )
        })}
      </select>
    </label>
  )
  const check = (key: string, label: string): JSX.Element => (
    <label>
      <input
        type="checkbox"
        checked={shared(key) === true}
        onChange={(e) => update(key, e.target.checked)}
      />
      {label}
    </label>
  )
  const same = objects.every((o) => o.kind === first?.kind)
  const sampleValues = evaluateVariables(d.template.variables, { sample: true }).values
  const createInlineVariable = (): string | null => {
    const requested = window.prompt('Variable name')?.trim()
    if (!requested) return null
    const variable = createVariable(
      'prompt',
      d.template.variables.map((item) => item.name),
      requested
    )
    useDocumentStore.getState().change((document) => ({
      ...document,
      template: {
        ...document.template,
        variables: [...document.template.variables, variable]
      }
    }))
    return variable.name
  }
  const outside = d.template.design.objects.filter((o) => {
    const b = bounds([o])
    return (
      b.x < -0.01 ||
      b.y < -0.01 ||
      b.x + b.width > d.template.stock.widthMm + 0.01 ||
      b.y + b.height > d.template.stock.heightMm + 0.01
    )
  })
  return (
    <div
      className="document-properties"
      onFocusCapture={() => useDocumentStore.getState().beginGesture()}
      onBlurCapture={(e) => {
        if (e.target !== e.relatedTarget) useDocumentStore.getState().endGesture()
      }}
    >
      <strong>
        Label · {d.template.stock.widthMm} × {d.template.stock.heightMm} mm · {d.template.stock.dpi}{' '}
        dpi
      </strong>
      {outside.length > 0 && (
        <p role="status">Outside label: {outside.map((o) => o.name).join(', ')}</p>
      )}
      {!first ? (
        <>
          <strong>Label metadata</strong>
          <label>
            Title
            <input
              aria-label="Label title"
              value={d.template.metadata.title}
              onChange={(event) => updateMetadata({ title: event.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              aria-label="Label description"
              value={d.template.metadata.description}
              onChange={(event) => updateMetadata({ description: event.target.value })}
            />
          </label>
          <label>
            Author
            <input
              aria-label="Label author"
              value={d.template.metadata.author}
              onChange={(event) => updateMetadata({ author: event.target.value })}
            />
          </label>
          <label>
            Tags
            <input
              aria-label="Label tags"
              value={d.template.metadata.tags.join(', ')}
              onChange={(event) =>
                updateMetadata({
                  tags: event.target.value
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .slice(0, 100)
                })
              }
            />
          </label>
          <label>
            Approval status
            <select
              aria-label="Approval status"
              value={d.template.metadata.status}
              onChange={(event) =>
                updateMetadata({ status: event.target.value as 'draft' | 'approved' })
              }
            >
              <option value="draft">Draft</option>
              <option value="approved">Approved for Station</option>
            </select>
          </label>
          <p>Select an object to edit its properties.</p>
        </>
      ) : (
        <>
          <strong>{objects.length} selected</strong>
          {same &&
          (first.kind === 'text' || first.kind === 'barcode' || first.kind === 'qrcode') &&
          objects.length === 1 ? (
            <DataSourceSection objectId={first.id} />
          ) : null}
          <div className="reference-point" role="group" aria-label="Transform reference point">
            {([0, 0.5, 1] as const).flatMap((y) =>
              ([0, 0.5, 1] as const).map((x) => (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  aria-label={`Reference ${x === 0 ? 'left' : x === 0.5 ? 'center' : 'right'} ${y === 0 ? 'top' : y === 0.5 ? 'middle' : 'bottom'}`}
                  aria-pressed={referencePoint.x === x && referencePoint.y === y}
                  onClick={() => useEditorStore.getState().setReferencePoint({ x, y })}
                >
                  •
                </button>
              ))
            )}
          </div>
          <div className="geometry-fields">
            {['xMm', 'yMm', 'widthMm', 'heightMm', 'rotation'].map((k) =>
              number(k, k === 'widthMm' || k === 'heightMm' ? 0.1 : -10000)
            )}
          </div>
          {same && first.kind === 'text' && (
            <>
              <TemplateField
                label="Text content"
                value={String(shared('text') ?? '')}
                variables={d.template.variables}
                multiline
                onChange={(value) => update('text', value)}
                onCreateVariable={createInlineVariable}
              />
              <small>
                Sample: {evaluateTemplate(String(shared('text') ?? ''), sampleValues).value}
              </small>
              <label>
                Font family
                <select
                  aria-label="Font family"
                  value={String(shared('fontFamily') ?? '')}
                  onChange={(event) => {
                    const font = fonts.find((item) => item.family === event.target.value)
                    if (!font) return
                    const warning = applyFontFamily(font, ids)
                    if (warning) window.alert(warning)
                  }}
                >
                  <option value="" disabled>
                    Mixed
                  </option>
                  {fonts.map((font) => (
                    <option key={`${font.source}-${font.id}`} value={font.family}>
                      {font.family}
                      {font.source === 'custom' ? ' · Custom' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {number('fontSizePt', 1, 1000)}
              {select('fontWeight', 'Weight', ['normal', 'bold'])}
              {select('fontStyle', 'Style', ['normal', 'italic'])}
              {select('align', 'Alignment', ['left', 'center', 'right'])}
              <label>
                Text color
                <span style={{ display: 'flex', gap: 6 }}>
                  <input
                    aria-label="Text color picker"
                    type="color"
                    value={String(shared('color') ?? '#000000')}
                    onChange={(event) => update('color', event.target.value)}
                  />
                  <input
                    key={String(shared('color') ?? '')}
                    aria-label="Text color hex value"
                    defaultValue={String(shared('color') ?? '')}
                    pattern="#[0-9a-fA-F]{6}"
                    maxLength={7}
                    onBlur={(event) => {
                      if (/^#[0-9a-fA-F]{6}$/.test(event.currentTarget.value))
                        update('color', event.currentTarget.value)
                      else event.currentTarget.value = String(shared('color') ?? '#000000')
                    }}
                  />
                </span>
              </label>
              {select('fitMode', 'Fit mode', ['none', 'shrink', 'fit-width', 'wrap'])}
              {(first.fitMode === 'shrink' || first.fitMode === 'fit-width') &&
                number('minFontSizePt', 1, first.fontSizePt)}
              {/* Only shrink treats the line count as a constraint: wrap keeps
                  every line and reports the box overflow instead. */}
              {first.fitMode === 'shrink' && number('maxLines', 1, 1000)}
              {(() => {
                const fit = fitText(
                  { ...first, text: evaluateTemplate(first.text, sampleValues).value },
                  canvasTextMeasurer
                )
                return fit.overflow ? (
                  <p role="alert">
                    {fit.atMinimum
                      ? `Text still overflows at the ${fit.fontSizePt} pt minimum.`
                      : first.fitMode === 'shrink'
                        ? 'Text exceeds its box or maximum line count.'
                        : 'Text exceeds its box.'}
                  </p>
                ) : fit.fontSizePt < first.fontSizePt ? (
                  <small>
                    Fitted size: {fit.fontSizePt.toFixed(2)} pt
                    {fit.reachedMinimum ? ' (minimum reached)' : ''}
                  </small>
                ) : null
              })()}
            </>
          )}
          {same && (first.kind === 'barcode' || first.kind === 'qrcode') && (
            <>
              <TemplateField
                label="Barcode data"
                value={String(shared('data') ?? '')}
                variables={d.template.variables}
                onChange={(value) => update('data', value)}
                onCreateVariable={createInlineVariable}
              />
              <small>
                Sample: {evaluateTemplate(String(shared('data') ?? ''), sampleValues).value}
              </small>
              {first.kind === 'barcode' ? (
                <>
                  {select('symbology', 'Symbology', BARCODE_SYMBOLOGIES)}
                  {number('moduleWidthMm', 0.05, 20)}
                  {number('barHeightMm', 0.1, 2000)}
                  {number('quietZoneMm', 0, 100)}
                  {check('showHumanReadable', 'Human-readable text')}
                  {first.showHumanReadable ? (
                    <TemplateField
                      label="Caption below barcode"
                      value={first.humanReadableText ?? ''}
                      variables={d.template.variables}
                      onChange={(value) => update('humanReadableText', value)}
                      onCreateVariable={createInlineVariable}
                    />
                  ) : null}
                  {check('addCheckDigit', 'Check digit')}
                </>
              ) : (
                <>
                  {select('symbology', 'Symbol', [
                    'qrcode',
                    'datamatrix',
                    'gs1datamatrix',
                    'gs1qrcode'
                  ])}
                  {number('moduleSizeMm', 0.05, 20)}
                  {select('errorCorrection', 'Error correction', ['L', 'M', 'Q', 'H'])}
                </>
              )}
              <Button onClick={() => useUiStore.getState().setGs1BuilderOpen(true)}>
                GS1 Builder…
              </Button>
              {objects.map((o) => {
                const error = barcodeErrors[o.id]
                if (!error) return null
                const symbology =
                  o.kind === 'barcode' || o.kind === 'qrcode' ? o.symbology : undefined
                const rule = symbology ? symbologyDataRule(symbology) : null
                return (
                  <div key={o.id}>
                    <div role="alert">
                      <p>{rule ?? encoderMessage(error)}</p>
                      {rule ? <small>{encoderMessage(error)}</small> : null}
                    </div>
                    {isGs1Symbology(symbology) && objects.length === 1 ? (
                      <Button onClick={() => useUiStore.getState().setGs1BuilderOpen(true)}>
                        Open GS1 Builder…
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            </>
          )}
          {same && ['rect', 'ellipse', 'line'].includes(first.kind) && (
            <>
              {number('strokeWidthMm', 0, 20)}
              {first.kind !== 'line' && select('fill', 'Fill', ['none', '#000000'])}
              {first.kind === 'rect' && number('cornerRadiusMm', 0, 1000)}
            </>
          )}
          {same && first.kind === 'image' && (
            <>
              {select('fit', 'Image fit', ['contain', 'cover', 'stretch'])}
              <label>
                <input
                  type="checkbox"
                  checked={first.monochrome.enabled}
                  onChange={(e) =>
                    update('monochrome', { ...first.monochrome, enabled: e.target.checked })
                  }
                />
                Monochrome image
              </label>
            </>
          )}
        </>
      )}
    </div>
  )
}
