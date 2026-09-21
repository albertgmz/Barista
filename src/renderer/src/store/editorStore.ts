/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { create } from 'zustand'
import { clamp } from '@shared/units'
import type { TemplateSegment } from '@shared/variables'

/**
 * The transient readout over the canvas: a measurement line, or the segments of
 * a source expression so the hover reveal can tint each variable.
 */
export type InteractionLabel = string | readonly TemplateSegment[]

/** The tools on the left toolbar. */
export type ToolId =
  'select' | 'text' | 'barcode' | 'qrcode' | 'image' | 'rect' | 'line' | 'pen' | 'ellipse'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 32
/** Multiplier applied by one Zoom In / Zoom Out step. */
const ZOOM_STEP = 1.2

export interface PointMm {
  x: number
  y: number
}
export interface ReferencePoint {
  x: 0 | 0.5 | 1
  y: 0 | 0.5 | 1
}

interface EditorState {
  activeTool: ToolId
  /** Ids of the currently selected canvas objects. */
  selectedIds: string[]
  /** Canvas scale, where 1 means 100%. */
  zoom: number
  /**
   * Pointer position in label millimetres, or null while the pointer is off
   * the canvas entirely. Positions outside the sheet are still reported, and
   * are negative above or left of the label origin.
   */
  cursorMm: PointMm | null
  /**
   * Incremented to ask the canvas to fit the label in the viewport. The canvas
   * owns the viewport size, so the command travels as a signal rather than a
   * computed zoom value.
   */
  fitRequest: number
  centerRequest: number
  selectionFitRequest: number
  referencePoint: ReferencePoint
  interactionLabel: InteractionLabel | null
  textSelection: { objectId: string; start: number; end: number } | null
  keepObjectsInsideLabel: boolean

  setActiveTool: (tool: ToolId) => void
  setSelectedIds: (ids: string[]) => void
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  requestZoomToFit: () => void
  requestActualSize: (zoom: number) => void
  requestZoomToSelection: () => void
  setCursorMm: (point: PointMm | null) => void
  setReferencePoint: (point: ReferencePoint) => void
  setInteractionLabel: (label: InteractionLabel | null) => void
  setTextSelection: (selection: EditorState['textSelection']) => void
  setKeepObjectsInsideLabel: (enabled: boolean) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  activeTool: 'select',
  selectedIds: [],
  zoom: 1,
  cursorMm: null,
  fitRequest: 0,
  centerRequest: 0,
  selectionFitRequest: 0,
  referencePoint: { x: 0, y: 0 },
  interactionLabel: null,
  textSelection: null,
  keepObjectsInsideLabel: false,

  setActiveTool: (activeTool) => set({ activeTool }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),

  setZoom: (zoom) => set({ zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) }),
  zoomIn: () => set((state) => ({ zoom: clamp(state.zoom * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM) })),
  zoomOut: () => set((state) => ({ zoom: clamp(state.zoom / ZOOM_STEP, MIN_ZOOM, MAX_ZOOM) })),
  requestZoomToFit: () => set((state) => ({ fitRequest: state.fitRequest + 1 })),
  requestActualSize: (zoom) =>
    set((state) => ({
      zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
      centerRequest: state.centerRequest + 1
    })),
  requestZoomToSelection: () =>
    set((state) => ({ selectionFitRequest: state.selectionFitRequest + 1 })),

  setCursorMm: (cursorMm) => set({ cursorMm }),
  setReferencePoint: (referencePoint) => set({ referencePoint }),
  setInteractionLabel: (interactionLabel) => set({ interactionLabel }),
  setTextSelection: (textSelection) => set({ textSelection }),
  setKeepObjectsInsideLabel: (keepObjectsInsideLabel) => set({ keepObjectsInsideLabel })
}))
