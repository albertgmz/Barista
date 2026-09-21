/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { bindDocumentCanvas } from './documentCanvas'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Canvas, config, Line, Point, Rect, Shadow } from 'fabric'
import type { TMat2D } from 'fabric'
import { clamp, mmToPx, pxToMm, roundMm } from '@shared/units'
import { bounds as objectBounds } from '@shared/template/document'
import { MAX_ZOOM, MIN_ZOOM, useDocumentStore, useEditorStore, useUiStore } from '@renderer/store'
import {
  centeredViewport,
  DEFAULT_MAX_FIT_ZOOM,
  fitViewport,
  resizedViewport
} from './canvasViewport'

/**
 * Resolution of the design surface. The canvas is a screen surface, so 100%
 * zoom means life size on a nominal 96 dpi display; `labelSize.dpi` describes
 * the printer and only matters once a job is rendered.
 */
const SCREEN_DPI = 96
/** Free space left around a selection by Zoom to Selection, in CSS pixels. */
const FIT_MARGIN_PX = 32
/** Below this the canvas zoom and the store zoom count as the same value. */
const ZOOM_EPSILON = 1e-6
const WHEEL_ZOOM_SENSITIVITY = 0.0015
/** Grid lines are coarsened until they are at least this far apart on screen. */
const MIN_GRID_SPACING_PX = 6
const MIDDLE_MOUSE_BUTTON = 1

/** Everything the rulers need in order to line up with the canvas. */
export interface CanvasViewport {
  /** Size of the canvas host in CSS pixels. */
  width: number
  height: number
  /** The label's top-left corner, in CSS pixels from the host's top-left. */
  originX: number
  originY: number
  /** Screen pixels per millimetre at the current zoom. */
  pxPerMm: number
  /** Backing-store scale, included so rulers repaint after a monitor DPI change. */
  pixelRatio: number
}

export interface FabricCanvasBinding {
  hostRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  viewport: CanvasViewport
}

/** Canvas objects carry an id so selection can be mirrored into the store. */

interface CanvasPalette {
  workspace: string
  label: string
  labelStroke: string
  grid: string
  shapeFill: string
  shapeStroke: string
}

const EMPTY_VIEWPORT: CanvasViewport = {
  width: 0,
  height: 0,
  originX: 0,
  originY: 0,
  pxPerMm: mmToPx(1, SCREEN_DPI),
  pixelRatio: 1
}

function palette(isDark: boolean): CanvasPalette {
  return isDark
    ? {
        workspace: '#1d1d21',
        label: '#ffffff',
        labelStroke: '#8f8f99',
        grid: '#c9c9d2',
        shapeFill: '#cfe0f7',
        shapeStroke: '#3f74bf'
      }
    : {
        workspace: '#e9e9ee',
        label: '#ffffff',
        labelStroke: '#b4b4bd',
        grid: '#d9d9e0',
        shapeFill: '#dceafa',
        shapeStroke: '#5b8fd6'
      }
}

function sameViewport(a: CanvasViewport, b: CanvasViewport): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.originX === b.originX &&
    a.originY === b.originY &&
    a.pxPerMm === b.pxPerMm &&
    a.pixelRatio === b.pixelRatio
  )
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/**
 * Controls a keyboard user activates with Space.
 *
 * Space is the pan modifier, but swallowing it everywhere would break the
 * activation of every button, tool and tab in the app, because native
 * activation happens on Space's *default action*.
 */
const ACTIVATABLE =
  'button,[role="button"],[role="radio"],[role="checkbox"],[role="menuitem"],[role="tab"],[role="option"],[role="switch"],a[href]'

function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(ACTIVATABLE) !== null
}

/**
 * Creates the Fabric canvas, wires it to the stores and tears it down again.
 *
 * The canvas lives inside a single mount-scoped effect: every listener,
 * subscription and piece of mutable state belongs to one instance, so a
 * StrictMode remount cannot leave the next instance holding stale references.
 */
export function useFabricCanvas(): FabricCanvasBinding {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [viewport, setViewport] = useState<CanvasViewport>(EMPTY_VIEWPORT)

  useEffect(() => {
    const container = hostRef.current
    const canvasEl = canvasRef.current
    if (container === null || canvasEl === null) return undefined
    // Re-bound with a non-null type because the handlers below are hoisted
    // declarations, which do not inherit the guard above.
    const host: HTMLDivElement = container

    let colors = palette(useUiStore.getState().isDark)

    const canvas = new Canvas(canvasEl, {
      backgroundColor: colors.workspace,
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      uniformScaling: false,
      selection: true
    })

    const labelRect = new Rect({
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      width: 1,
      height: 1,
      fill: colors.label,
      stroke: colors.labelStroke,
      strokeWidth: 1,
      strokeUniform: true,
      selectable: false,
      evented: false,
      hoverCursor: 'default',
      shadow: new Shadow({
        color: 'rgba(0, 0, 0, 0.3)',
        blur: 12,
        offsetX: 0,
        offsetY: 3,
        nonScaling: true
      })
    })
    const safeAreaRect = new Rect({
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      width: 1,
      height: 1,
      fill: 'transparent',
      stroke: '#d97706',
      strokeDashArray: [5, 4],
      strokeWidth: 1,
      strokeUniform: true,
      selectable: false,
      evented: false,
      hoverCursor: 'default',
      objectCaching: false
    })
    canvas.add(labelRect, safeAreaRect)

    let gridLines: Line[] = []
    let documentGuideLines: Line[] = []
    let appliedZoom = canvas.getZoom()
    let spaceDown = false
    let panning = false
    let panOrigin = { x: 0, y: 0 }
    let handledFitRequest = useEditorStore.getState().fitRequest
    let handledCenterRequest = useEditorStore.getState().centerRequest
    let handledSelectionFitRequest = useEditorStore.getState().selectionFitRequest
    // A zero-sized first layout is normal while Dockview restores. Keep the
    // request pending until ResizeObserver supplies usable CSS dimensions.
    let fitPending = true
    let appliedRetina = canvas.getRetinaScaling()

    function publishViewport(): void {
      const [scale, , , , translateX, translateY] = canvas.viewportTransform
      const next: CanvasViewport = {
        width: canvas.getWidth(),
        height: canvas.getHeight(),
        originX: translateX,
        originY: translateY,
        pxPerMm: mmToPx(1, SCREEN_DPI) * scale,
        pixelRatio: appliedRetina
      }
      setViewport((current) => (sameViewport(current, next) ? current : next))
    }

    function rebuildGrid(): void {
      if (gridLines.length > 0) {
        canvas.remove(...gridLines)
        gridLines = []
      }

      const { showGrid, gridSizeMm } = useUiStore.getState()
      if (!showGrid || gridSizeMm <= 0) return

      const { widthMm, heightMm } = useDocumentStore.getState().labelSize
      const zoom = canvas.getZoom()
      const pxPerMm = mmToPx(1, SCREEN_DPI) * zoom
      const stepMm = gridSizeMm * Math.max(1, Math.ceil(MIN_GRID_SPACING_PX / pxPerMm / gridSizeMm))
      const width = mmToPx(widthMm, SCREEN_DPI)
      const height = mmToPx(heightMm, SCREEN_DPI)
      const options = {
        stroke: colors.grid,
        // A hairline on screen at any zoom, since the line lives in scene units.
        strokeWidth: 1 / zoom,
        selectable: false,
        evented: false,
        hoverCursor: 'default',
        objectCaching: false
      }

      for (let mm = stepMm; mm < widthMm; mm += stepMm) {
        const x = mmToPx(mm, SCREEN_DPI)
        gridLines.push(new Line([x, 0, x, height], options))
      }
      for (let mm = stepMm; mm < heightMm; mm += stepMm) {
        const y = mmToPx(mm, SCREEN_DPI)
        gridLines.push(new Line([0, y, width, y], options))
      }
      if (gridLines.length > 0) {
        // Index 1 keeps the grid above the label sheet but below the objects.
        canvas.insertAt(1, ...gridLines)
      }
    }

    function rebuildDocumentGuides(): void {
      if (documentGuideLines.length) canvas.remove(...documentGuideLines)
      const { stock, design } = useDocumentStore.getState().document.template
      const { guides } = design
      documentGuideLines = guides.map(
        (guide) =>
          new Line(
            guide.axis === 'x'
              ? [
                  mmToPx(guide.positionMm, SCREEN_DPI),
                  0,
                  mmToPx(guide.positionMm, SCREEN_DPI),
                  mmToPx(stock.heightMm, SCREEN_DPI)
                ]
              : [
                  0,
                  mmToPx(guide.positionMm, SCREEN_DPI),
                  mmToPx(stock.widthMm, SCREEN_DPI),
                  mmToPx(guide.positionMm, SCREEN_DPI)
                ],
            {
              stroke: guide.locked ? '#8a5bd8' : '#0f9dd7',
              strokeWidth: 1 / canvas.getZoom(),
              selectable: false,
              evented: false,
              objectCaching: false
            }
          )
      )
      canvas.add(...documentGuideLines)
      canvas.requestRenderAll()
    }

    function applyLabelStock(): void {
      const stock = useDocumentStore.getState().labelSize
      const { widthMm, heightMm } = stock
      const ellipse = stock.shape === 'circle' || stock.shape === 'ellipse'
      const radius = ellipse
        ? { rx: mmToPx(widthMm / 2, SCREEN_DPI), ry: mmToPx(heightMm / 2, SCREEN_DPI) }
        : {
            rx: mmToPx(stock.shape === 'rounded' ? stock.cornerRadiusMm : 0, SCREEN_DPI),
            ry: mmToPx(stock.shape === 'rounded' ? stock.cornerRadiusMm : 0, SCREEN_DPI)
          }
      labelRect.set({
        fill: stock.backgroundColor,
        ...radius,
        width: mmToPx(widthMm, SCREEN_DPI),
        height: mmToPx(heightMm, SCREEN_DPI)
      })
      const margin = stock.safeAreaMarginMm
      safeAreaRect.set({
        left: mmToPx(margin, SCREEN_DPI),
        top: mmToPx(margin, SCREEN_DPI),
        width: mmToPx(Math.max(0, widthMm - margin * 2), SCREEN_DPI),
        height: mmToPx(Math.max(0, heightMm - margin * 2), SCREEN_DPI),
        rx: Math.max(0, radius.rx - mmToPx(margin, SCREEN_DPI)),
        ry: Math.max(0, radius.ry - mmToPx(margin, SCREEN_DPI)),
        visible: margin > 0
      })
      labelRect.setCoords()
      safeAreaRect.setCoords()
      rebuildGrid()
      rebuildDocumentGuides()
      canvas.requestRenderAll()
    }

    function applyTheme(): void {
      colors = palette(useUiStore.getState().isDark)
      canvas.backgroundColor = colors.workspace
      labelRect.set({
        fill: useDocumentStore.getState().labelSize.backgroundColor,
        stroke: colors.labelStroke
      })
      rebuildGrid()
      canvas.requestRenderAll()
    }

    function applyZoom(nextZoom: number, anchor: Point): void {
      const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
      // Recorded even when nothing moves, so the store subscription below can
      // always tell a zoom this canvas produced from one it has to apply.
      appliedZoom = clamped
      if (Math.abs(clamped - canvas.getZoom()) < ZOOM_EPSILON) return
      canvas.zoomToPoint(anchor, clamped)
      rebuildGrid()
      canvas.requestRenderAll()
      publishViewport()
    }

    function applyCenteredViewport(layout: {
      zoom: number
      offsetX: number
      offsetY: number
    }): void {
      appliedZoom = layout.zoom
      canvas.setViewportTransform([layout.zoom, 0, 0, layout.zoom, layout.offsetX, layout.offsetY])
      rebuildGrid()
      canvas.requestRenderAll()
      publishViewport()
    }

    function centerLabel(zoom = canvas.getZoom()): boolean {
      const { widthMm, heightMm } = useDocumentStore.getState().labelSize
      const labelWidth = mmToPx(widthMm, SCREEN_DPI)
      const labelHeight = mmToPx(heightMm, SCREEN_DPI)
      const layout = centeredViewport({
        containerWidth: canvas.getWidth(),
        containerHeight: canvas.getHeight(),
        labelWidth,
        labelHeight,
        zoom
      })
      if (layout === null) return false
      applyCenteredViewport(layout)
      return true
    }

    function zoomToFit(): boolean {
      const { widthMm, heightMm } = useDocumentStore.getState().labelSize
      const layout = fitViewport({
        containerWidth: canvas.getWidth(),
        containerHeight: canvas.getHeight(),
        labelWidth: mmToPx(widthMm, SCREEN_DPI),
        labelHeight: mmToPx(heightMm, SCREEN_DPI),
        minZoom: MIN_ZOOM,
        maxZoom: Math.min(MAX_ZOOM, DEFAULT_MAX_FIT_ZOOM)
      })
      if (layout === null) return false
      applyCenteredViewport(layout)
      useEditorStore.getState().setZoom(layout.zoom)
      return true
    }

    function zoomToSelection(): void {
      const ids = useEditorStore.getState().selectedIds
      const selected = useDocumentStore
        .getState()
        .document.template.design.objects.filter((object) => ids.includes(object.id))
      if (!selected.length) return
      const area = objectBounds(selected)
      const width = mmToPx(Math.max(area.width, 0.1), SCREEN_DPI)
      const height = mmToPx(Math.max(area.height, 0.1), SCREEN_DPI)
      const zoom = clamp(
        Math.min(
          (canvas.getWidth() - FIT_MARGIN_PX * 2) / width,
          (canvas.getHeight() - FIT_MARGIN_PX * 2) / height
        ),
        MIN_ZOOM,
        MAX_ZOOM
      )
      appliedZoom = zoom
      canvas.setViewportTransform([
        zoom,
        0,
        0,
        zoom,
        canvas.getWidth() / 2 - mmToPx(area.x + area.width / 2, SCREEN_DPI) * zoom,
        canvas.getHeight() / 2 - mmToPx(area.y + area.height / 2, SCREEN_DPI) * zoom
      ])
      rebuildGrid()
      canvas.requestRenderAll()
      publishViewport()
      useEditorStore.getState().setZoom(zoom)
    }

    function syncSize(width = host.clientWidth, height = host.clientHeight): void {
      width = Math.floor(width)
      height = Math.floor(height)
      if (width <= 0 || height <= 0) return
      const previousWidth = canvas.getWidth()
      const previousHeight = canvas.getHeight()
      const [zoom, , , , offsetX, offsetY] = canvas.viewportTransform
      const resized = width !== previousWidth || height !== previousHeight
      config.configure({ devicePixelRatio: window.devicePixelRatio })
      const nextRetina = canvas.getRetinaScaling()
      const retinaChanged = nextRetina !== appliedRetina
      if (resized || retinaChanged) {
        canvas.setDimensions({ width, height })
        appliedRetina = nextRetina
      }
      if (fitPending) {
        if (zoomToFit()) fitPending = false
        return
      }
      if (resized) {
        const layout = resizedViewport({
          previousWidth,
          previousHeight,
          containerWidth: width,
          containerHeight: height,
          zoom,
          offsetX,
          offsetY
        })
        if (layout) applyCenteredViewport(layout)
      } else {
        if (retinaChanged) canvas.requestRenderAll()
        publishViewport()
      }
    }

    function applyPointerMode(): void {
      const held = spaceDown || panning
      canvas.skipTargetFind = held || useEditorStore.getState().activeTool !== 'select'
      canvas.selection = !held && useEditorStore.getState().activeTool === 'select'
      canvas.defaultCursor = panning ? 'grabbing' : spaceDown ? 'grab' : 'default'
      canvas.setCursor(canvas.defaultCursor)
    }

    function onWheel(event: WheelEvent): void {
      if (!event.ctrlKey) return
      event.preventDefault()
      const bounds = canvas.upperCanvasEl.getBoundingClientRect()
      const anchor = new Point(event.clientX - bounds.left, event.clientY - bounds.top)
      const next = clamp(
        canvas.getZoom() * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
        MIN_ZOOM,
        MAX_ZOOM
      )
      applyZoom(next, anchor)
      useEditorStore.getState().setZoom(next)
    }

    function onHostPointerMove(event: PointerEvent): void {
      const scene = canvas.getScenePoint(event)
      useEditorStore.getState().setCursorMm({
        x: roundMm(pxToMm(scene.x, SCREEN_DPI)),
        y: roundMm(pxToMm(scene.y, SCREEN_DPI))
      })
    }

    function onHostPointerLeave(): void {
      useEditorStore.getState().setCursorMm(null)
    }

    /**
     * Captured on `window` so the gesture is claimed before Fabric's handlers
     * on the canvas element see it. Cancelling the pointer event also
     * suppresses the compatibility mouse events Fabric listens to, so a pan
     * that starts over an object never drags it.
     */
    function onPointerDownCapture(event: PointerEvent): void {
      if (!spaceDown && event.button !== MIDDLE_MOUSE_BUTTON) return
      if (!(event.target instanceof Node) || !host.contains(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      panning = true
      panOrigin = { x: event.clientX, y: event.clientY }
      applyPointerMode()
    }

    function onPointerMove(event: PointerEvent): void {
      if (!panning) return
      const [a, b, c, d, translateX, translateY] = canvas.viewportTransform
      const transform: TMat2D = [
        a,
        b,
        c,
        d,
        translateX + event.clientX - panOrigin.x,
        translateY + event.clientY - panOrigin.y
      ]
      panOrigin = { x: event.clientX, y: event.clientY }
      canvas.setViewportTransform(transform)
      canvas.setCursor('grabbing')
      publishViewport()
    }

    function onPointerUp(): void {
      if (!panning) return
      panning = false
      applyPointerMode()
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.code !== 'Space' || isTextEntry(event.target)) return
      // A focused control must keep Space for its own activation.
      if (isActivatable(event.target)) return
      // Space pans, so it must not scroll the shell.
      event.preventDefault()
      if (spaceDown) return
      spaceDown = true
      applyPointerMode()
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (event.code !== 'Space' || !spaceDown) return
      spaceDown = false
      applyPointerMode()
    }

    function onWindowBlur(): void {
      if (!spaceDown && !panning) return
      spaceDown = false
      panning = false
      applyPointerMode()
    }

    function onWindowResize(): void {
      syncSize()
    }

    const unbindDocument = bindDocumentCanvas(canvas, host)

    const unsubscribeUi = useUiStore.subscribe((state, previous) => {
      if (state.isDark !== previous.isDark) {
        applyTheme()
      } else if (state.showGrid !== previous.showGrid || state.gridSizeMm !== previous.gridSizeMm) {
        rebuildGrid()
        canvas.requestRenderAll()
      }
    })

    const unsubscribeDocument = useDocumentStore.subscribe((state, previous) => {
      if (state.labelSize !== previous.labelSize) {
        applyLabelStock()
        fitPending = true
        if (zoomToFit()) fitPending = false
      }
      if (state.document.template.design.guides !== previous.document.template.design.guides)
        rebuildDocumentGuides()
    })

    const unsubscribeEditor = useEditorStore.subscribe((state) => {
      if (Math.abs(state.zoom - appliedZoom) > ZOOM_EPSILON) {
        applyZoom(state.zoom, canvas.getCenterPoint())
      }
      if (state.fitRequest !== handledFitRequest) {
        handledFitRequest = state.fitRequest
        fitPending = true
        if (zoomToFit()) fitPending = false
      }
      if (state.centerRequest !== handledCenterRequest) {
        handledCenterRequest = state.centerRequest
        centerLabel(state.zoom)
      }
      if (state.selectionFitRequest !== handledSelectionFitRequest) {
        handledSelectionFitRequest = state.selectionFitRequest
        zoomToSelection()
      }
    })

    const observer = new ResizeObserver(([entry]) => {
      if (entry) syncSize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(host)

    // Non-passive: the zoom gesture has to cancel the default wheel behaviour.
    host.addEventListener('wheel', onWheel, { passive: false })
    host.addEventListener('pointermove', onHostPointerMove)
    host.addEventListener('pointerleave', onHostPointerLeave)
    window.addEventListener('pointerdown', onPointerDownCapture, true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('resize', onWindowResize)

    applyLabelStock()
    rebuildDocumentGuides()
    syncSize()

    return () => {
      observer.disconnect()
      host.removeEventListener('wheel', onWheel)
      host.removeEventListener('pointermove', onHostPointerMove)
      host.removeEventListener('pointerleave', onHostPointerLeave)
      window.removeEventListener('pointerdown', onPointerDownCapture, true)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('resize', onWindowResize)
      unsubscribeUi()
      unsubscribeDocument()
      unsubscribeEditor()
      unbindDocument()

      // `dispose()` only finishes synchronously when no render is queued, and
      // only then has Fabric released the canvas element by the time React's
      // StrictMode remount re-initialises it on the very same node.
      canvas.cancelRequestedRender()
      void canvas.dispose().catch(() => undefined)
    }
  }, [])

  return { hostRef, canvasRef, viewport }
}
