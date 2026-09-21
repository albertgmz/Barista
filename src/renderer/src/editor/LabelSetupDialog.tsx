/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle
} from '@fluentui/react-components'
import { useDocumentStore, useEditorStore, useUiStore } from '../store'
import { StockEditor } from './StockEditor'
import { stockSchema } from '@shared/template/schema'

export function LabelSetupDialog(): JSX.Element | null {
  const open = useUiStore((state) => state.isLabelSetupOpen)
  const printing = useUiStore((state) => state.isPrintDialogOpen)
  if (printing) return null
  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => useUiStore.getState().setLabelSetupOpen(data.open)}
    >
      <DialogSurface>{open ? <LabelSetupContent /> : null}</DialogSurface>
    </Dialog>
  )
}

export function LabelSetupContent(): JSX.Element {
  const [stock, setStock] = useState(() => structuredClone(useDocumentStore.getState().labelSize))
  const [units, setUnits] = useState<'in' | 'mm'>('mm')
  const [historyLimit, setHistoryLimit] = useState(useDocumentStore.getState().historyLimit)
  const valid = stockSchema.safeParse(stock).success

  return (
    <DialogBody>
      <DialogTitle>Label Setup</DialogTitle>
      <DialogContent className="document-properties">
        <StockEditor stock={stock} units={units} onUnitsChange={setUnits} onChange={setStock} />
        <label>
          Preview background
          <input
            aria-label="Label preview background"
            type="color"
            value={stock.backgroundColor}
            onChange={(event) => setStock({ ...stock, backgroundColor: event.target.value })}
          />
        </label>
        <label>
          Undo history limit
          <input
            aria-label="Undo history limit"
            type="number"
            min="1"
            max="1000"
            value={historyLimit}
            onChange={(event) => setHistoryLimit(event.currentTarget.valueAsNumber)}
          />
        </label>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => useUiStore.getState().setLabelSetupOpen(false)}>Cancel</Button>
        <Button
          appearance="primary"
          disabled={!valid}
          onClick={() => {
            useDocumentStore.getState().setLabelStock(stock)
            useDocumentStore.getState().setHistoryLimit(historyLimit)
            useEditorStore.getState().requestZoomToFit()
            useUiStore.getState().setLabelSetupOpen(false)
          }}
        >
          OK
        </Button>
      </DialogActions>
    </DialogBody>
  )
}
