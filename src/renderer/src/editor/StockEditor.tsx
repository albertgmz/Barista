/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { JSX } from 'react'
import type { LabelStock } from '@shared/template/types'
import { MM_PER_INCH } from '@shared/units'

interface StockEditorProps {
  stock: LabelStock
  units: 'in' | 'mm'
  onUnitsChange: (units: 'in' | 'mm') => void
  onChange: (stock: LabelStock) => void
}

export function StockEditor({
  stock,
  units,
  onUnitsChange,
  onChange
}: StockEditorProps): JSX.Element {
  const factor = units === 'in' ? MM_PER_INCH : 1
  const numberField = (
    label: string,
    valueMm: number,
    update: (valueMm: number) => LabelStock,
    min = 0
  ): JSX.Element => (
    <label>
      {label} ({units})
      <input
        type="number"
        min={min / factor}
        max={2000 / factor}
        step={units === 'in' ? 0.01 : 0.1}
        value={Number((valueMm / factor).toFixed(4))}
        onChange={(event) => {
          const value = event.currentTarget.valueAsNumber * factor
          if (Number.isFinite(value)) onChange(update(value))
        }}
      />
    </label>
  )

  return (
    <div className="stock-editor">
      <label>
        Units
        <select
          value={units}
          onChange={(event) => onUnitsChange(event.target.value as 'in' | 'mm')}
        >
          <option value="mm">Millimetres</option>
          <option value="in">Inches</option>
        </select>
      </label>
      <label>
        Orientation
        <select
          value={stock.widthMm > stock.heightMm ? 'landscape' : 'portrait'}
          onChange={(event) => {
            if ((event.target.value === 'landscape') !== stock.widthMm > stock.heightMm)
              onChange({ ...stock, widthMm: stock.heightMm, heightMm: stock.widthMm })
          }}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      {numberField('Width', stock.widthMm, (widthMm) => ({ ...stock, widthMm }), 1)}
      {numberField('Height', stock.heightMm, (heightMm) => ({ ...stock, heightMm }), 1)}
      <label>
        DPI
        <select
          value={stock.dpi}
          onChange={(event) =>
            onChange({ ...stock, dpi: Number(event.target.value) as 203 | 300 | 600 })
          }
        >
          <option value="203">203</option>
          <option value="300">300</option>
          <option value="600">600</option>
        </select>
      </label>
      <label>
        Shape
        <select
          value={stock.shape}
          onChange={(event) =>
            onChange({ ...stock, shape: event.target.value as LabelStock['shape'] })
          }
        >
          <option value="rectangle">Rectangle</option>
          <option value="rounded">Rounded rectangle</option>
          <option value="circle">Circle</option>
          <option value="ellipse">Ellipse</option>
        </select>
      </label>
      {numberField('Corner radius', stock.cornerRadiusMm, (cornerRadiusMm) => ({
        ...stock,
        cornerRadiusMm
      }))}
      {numberField('Safe margin', stock.safeAreaMarginMm, (safeAreaMarginMm) => ({
        ...stock,
        safeAreaMarginMm
      }))}
      {numberField('Gap', stock.gapMm, (gapMm) => ({ ...stock, gapMm }))}
      <label>
        Media
        <select
          value={stock.feed.kind}
          onChange={(event) =>
            onChange({
              ...stock,
              feed:
                event.target.value === 'roll'
                  ? { kind: 'roll' }
                  : {
                      kind: 'sheet',
                      rows: 1,
                      columns: 1,
                      pitchXMm: stock.widthMm + stock.gapMm,
                      pitchYMm: stock.heightMm + stock.gapMm,
                      sheetWidthMm: stock.widthMm,
                      sheetHeightMm: stock.heightMm
                    }
            })
          }
        >
          <option value="roll">Roll</option>
          <option value="sheet">Sheet</option>
        </select>
      </label>
      {stock.feed.kind === 'sheet' ? (
        <div className="stock-editor-sheet">
          <label>
            Rows
            <input
              type="number"
              min="1"
              max="1000"
              value={stock.feed.rows}
              onChange={(event) =>
                stock.feed.kind === 'sheet' &&
                onChange({
                  ...stock,
                  feed: { ...stock.feed, rows: event.currentTarget.valueAsNumber }
                })
              }
            />
          </label>
          <label>
            Columns
            <input
              type="number"
              min="1"
              max="1000"
              value={stock.feed.columns}
              onChange={(event) =>
                stock.feed.kind === 'sheet' &&
                onChange({
                  ...stock,
                  feed: { ...stock.feed, columns: event.currentTarget.valueAsNumber }
                })
              }
            />
          </label>
          {numberField('Horizontal pitch', stock.feed.pitchXMm, (pitchXMm) => ({
            ...stock,
            feed: stock.feed.kind === 'sheet' ? { ...stock.feed, pitchXMm } : stock.feed
          }))}
          {numberField('Vertical pitch', stock.feed.pitchYMm, (pitchYMm) => ({
            ...stock,
            feed: stock.feed.kind === 'sheet' ? { ...stock.feed, pitchYMm } : stock.feed
          }))}
          {numberField(
            'Sheet width',
            stock.feed.sheetWidthMm,
            (sheetWidthMm) => ({
              ...stock,
              feed: stock.feed.kind === 'sheet' ? { ...stock.feed, sheetWidthMm } : stock.feed
            }),
            1
          )}
          {numberField(
            'Sheet height',
            stock.feed.sheetHeightMm,
            (sheetHeightMm) => ({
              ...stock,
              feed: stock.feed.kind === 'sheet' ? { ...stock.feed, sheetHeightMm } : stock.feed
            }),
            1
          )}
        </div>
      ) : null}
    </div>
  )
}
