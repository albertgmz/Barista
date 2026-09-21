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
import { createDocument, newId } from '@shared/template/document'
import {
  BUILT_IN_STOCK_PRESETS,
  STOCK_PRESET_CATEGORIES,
  type StockPreset,
  type StockPresetCategory
} from '@shared/template/stockPresets'
import type { LabelStock } from '@shared/template/types'
import { stockSchema } from '@shared/template/schema'
import { useDocumentStore, useEditorStore, useUiStore } from '../store'
import { StockEditor } from './StockEditor'

const initialPreset = BUILT_IN_STOCK_PRESETS.find((preset) => preset.name === '60 × 35 mm')!

export function NewLabelDialog(): JSX.Element {
  const open = useUiStore((state) => state.isNewLabelOpen)
  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => useUiStore.getState().setNewLabelOpen(data.open)}
    >
      <DialogSurface
        className="new-label-dialog"
        style={{ width: 'min(1120px, calc(100vw - 48px))', maxWidth: 'none' }}
      >
        {open ? <NewLabelContent /> : null}
      </DialogSurface>
    </Dialog>
  )
}

function NewLabelContent(): JSX.Element {
  const [category, setCategory] = useState<StockPresetCategory>('Thermal – metric')
  const [custom, setCustom] = useState<StockPreset[]>([])
  const [recent, setRecent] = useState<StockPreset[]>([])
  const [selectedId, setSelectedId] = useState(initialPreset.id)
  const [name, setName] = useState(initialPreset.name)
  const [stock, setStock] = useState<LabelStock>(structuredClone(initialPreset.stock))
  const [units, setUnits] = useState<'in' | 'mm'>(initialPreset.units)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.barista.invoke('stockPreset:list').then((result) => {
      if (!result.ok) return setError(result.error.message)
      setCustom(result.value.custom)
      setRecent(result.value.recent)
    })
  }, [])

  const presets = useMemo(() => {
    if (category === 'My Presets') return custom
    if (category === 'Recent') return recent
    return BUILT_IN_STOCK_PRESETS.filter((preset) => preset.category === category)
  }, [category, custom, recent])

  const choose = (preset: StockPreset): void => {
    setSelectedId(preset.id)
    setName(preset.name)
    setStock(structuredClone(preset.stock))
    setUnits(preset.units)
  }
  const valid = name.trim().length > 0 && stockSchema.safeParse(stock).success

  const savePreset = async (): Promise<void> => {
    const current = custom.find((preset) => preset.id === selectedId)
    const preset: StockPreset = {
      id: current?.id ?? `custom-${newId()}`,
      name: name.trim(),
      category: 'My Presets',
      units,
      stock,
      custom: true
    }
    const result = await window.barista.invoke('stockPreset:save', preset)
    if (!result.ok) return setError(result.error.message)
    setCustom([preset, ...custom.filter((item) => item.id !== preset.id)])
    setSelectedId(preset.id)
    setCategory('My Presets')
    setError('')
  }

  return (
    <DialogBody>
      <DialogTitle>New Label</DialogTitle>
      <DialogContent className="new-label-layout">
        <nav className="new-label-categories" aria-label="Label categories">
          {STOCK_PRESET_CATEGORIES.map((item) => (
            <button
              key={item}
              className={item === category ? 'selected' : ''}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <section className="new-label-presets" aria-label={`${category} presets`}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              className={preset.id === selectedId ? 'selected' : ''}
              onClick={() => choose(preset)}
            >
              <span
                className={`stock-thumbnail shape-${preset.stock.shape}`}
                style={{ aspectRatio: `${preset.stock.widthMm} / ${preset.stock.heightMm}` }}
              />
              <strong>{preset.name}</strong>
              <small>{preset.stock.dpi} DPI</small>
            </button>
          ))}
          {!presets.length ? <p>No presets in this category yet.</p> : null}
        </section>
        <section className="new-label-details" aria-label="Label details">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <StockEditor stock={stock} units={units} onUnitsChange={setUnits} onChange={setStock} />
          <div className="preset-actions">
            <Button disabled={!valid} onClick={() => void savePreset()}>
              {custom.some((preset) => preset.id === selectedId)
                ? 'Rename / update preset'
                : 'Save as preset'}
            </Button>
            <Button
              disabled={!custom.some((preset) => preset.id === selectedId)}
              onClick={() => {
                void window.barista
                  .invoke('stockPreset:delete', { id: selectedId })
                  .then((result) => {
                    if (!result.ok) return setError(result.error.message)
                    setCustom(custom.filter((preset) => preset.id !== selectedId))
                    choose(initialPreset)
                  })
              }}
            >
              Delete preset
            </Button>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => useUiStore.getState().setNewLabelOpen(false)}>Cancel</Button>
        <Button
          appearance="primary"
          disabled={!valid}
          onClick={() => {
            const preset: StockPreset = { id: selectedId, name, category: 'Recent', units, stock }
            useDocumentStore.getState().loadDocument(createDocument(stock, name.trim()), null)
            useEditorStore.getState().setSelectedIds([])
            useEditorStore.getState().requestZoomToFit()
            useUiStore.getState().setNewLabelOpen(false)
            void window.barista.invoke('stockPreset:touch', preset)
          }}
        >
          Create
        </Button>
      </DialogActions>
    </DialogBody>
  )
}
