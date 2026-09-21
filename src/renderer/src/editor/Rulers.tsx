/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useRef } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { parseMeasurement, roundMm } from '@shared/units'
import { useDocumentStore, useEditorStore, useUiStore } from '@renderer/store'
import type { CanvasViewport } from './useFabricCanvas'

/** Thickness of each ruler strip, in CSS pixels. */
export const RULER_SIZE = 20

const TICK_STEPS_MM = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]
const COARSEST_STEP_MM = 500
const MIN_TICK_SPACING_PX = 5
const MIN_LABEL_SPACING_PX = 56
const MINOR_TICK_PX = 4
const MAJOR_TICK_PX = 9
const RULER_FONT = '10px "Inter", sans-serif'

type RulerAxis = 'horizontal' | 'vertical'

interface RulerInk {
  tick: string
  label: string
  edge: string
}

interface RulersProps {
  viewport: CanvasViewport
  onGuide: (axis: 'x' | 'y', positionMm: number) => void
}

const useStyles = makeStyles({
  strip: {
    display: 'block',
    backgroundColor: tokens.colorNeutralBackground3
  },
  horizontal: {
    width: '100%',
    height: `${RULER_SIZE}px`
  },
  vertical: {
    width: `${RULER_SIZE}px`,
    height: '100%'
  },
  corner: {
    width: `${RULER_SIZE}px`,
    height: `${RULER_SIZE}px`,
    backgroundColor: tokens.colorNeutralBackground3
  }
})

function rulerInk(isDark: boolean): RulerInk {
  return isDark
    ? { tick: '#7a7a85', label: '#c5c5cf', edge: '#3a3a42' }
    : { tick: '#9b9ba5', label: '#4a4a55', edge: '#d6d6dd' }
}

/** The coarsest step that still leaves at least `minSpacingPx` between marks. */
function pickStepMm(pxPerMm: number, minSpacingPx: number): number {
  for (const step of TICK_STEPS_MM) {
    if (step * pxPerMm >= minSpacingPx) return step
  }
  return COARSEST_STEP_MM
}

function drawRuler(
  element: HTMLCanvasElement,
  axis: RulerAxis,
  viewport: CanvasViewport,
  isDark: boolean,
  units: 'mm' | 'in',
  cursorMm: number | null
): void {
  const bounds = element.getBoundingClientRect()
  const cssWidth = Math.max(1, Math.round(bounds.width))
  const cssHeight = Math.max(1, Math.round(bounds.height))
  const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1

  element.width = Math.round(cssWidth * ratio)
  element.height = Math.round(cssHeight * ratio)

  const ctx = element.getContext('2d')
  if (ctx === null) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)

  const { pxPerMm } = viewport
  if (pxPerMm <= 0) return

  const horizontal = axis === 'horizontal'
  const span = horizontal ? cssWidth : cssHeight
  const origin = horizontal ? viewport.originX : viewport.originY
  const startMm = -origin / pxPerMm
  const endMm = (span - origin) / pxPerMm
  const ink = rulerInk(isDark)

  const forEachTick = (stepMm: number, visit: (mm: number, position: number) => void): void => {
    const firstMm = Math.ceil(startMm / stepMm) * stepMm
    for (let index = 0; ; index += 1) {
      const mm = firstMm + index * stepMm
      if (mm > endMm) return
      // The half pixel keeps a one pixel line from straddling two device rows.
      visit(mm, Math.round(origin + mm * pxPerMm) + 0.5)
    }
  }

  const strokeTick = (position: number, length: number): void => {
    if (horizontal) {
      ctx.moveTo(position, cssHeight)
      ctx.lineTo(position, cssHeight - length)
    } else {
      ctx.moveTo(cssWidth, position)
      ctx.lineTo(cssWidth - length, position)
    }
  }

  ctx.lineWidth = 1
  ctx.strokeStyle = ink.tick
  ctx.beginPath()
  forEachTick(pickStepMm(pxPerMm, MIN_TICK_SPACING_PX), (_mm, position) => {
    strokeTick(position, MINOR_TICK_PX)
  })
  const labelStepMm = pickStepMm(pxPerMm, MIN_LABEL_SPACING_PX)
  forEachTick(labelStepMm, (_mm, position) => {
    strokeTick(position, MAJOR_TICK_PX)
  })
  ctx.stroke()

  ctx.fillStyle = ink.label
  ctx.font = RULER_FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  forEachTick(labelStepMm, (mm, position) => {
    const text = String(roundMm(units === 'in' ? mm / 25.4 : mm, units === 'in' ? 3 : 1))
    if (horizontal) {
      ctx.fillText(text, position + 3, 2)
    } else {
      ctx.save()
      ctx.translate(2, position - 3)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(text, 0, 0)
      ctx.restore()
    }
  })

  ctx.strokeStyle = ink.edge
  ctx.beginPath()
  if (horizontal) {
    ctx.moveTo(0, cssHeight - 0.5)
    ctx.lineTo(cssWidth, cssHeight - 0.5)
  } else {
    ctx.moveTo(cssWidth - 0.5, 0)
    ctx.lineTo(cssWidth - 0.5, cssHeight)
  }
  ctx.stroke()

  if (cursorMm !== null) {
    const position = Math.round(origin + cursorMm * pxPerMm) + 0.5
    ctx.strokeStyle = '#0f9dd7'
    ctx.beginPath()
    if (horizontal) {
      ctx.moveTo(position, 0)
      ctx.lineTo(position, cssHeight)
    } else {
      ctx.moveTo(0, position)
      ctx.lineTo(cssWidth, position)
    }
    ctx.stroke()
  }
}

/**
 * Millimetre rulers along the top and left of the canvas, with zero at the
 * label's top-left corner. Rendered as a fragment so the stage can place the
 * corner, the top strip and the left strip in its own grid.
 */
export function Rulers({ viewport, onGuide }: RulersProps): React.JSX.Element {
  const styles = useStyles()
  const isDark = useUiStore((state) => state.isDark)
  const horizontalRef = useRef<HTMLCanvasElement | null>(null)
  const verticalRef = useRef<HTMLCanvasElement | null>(null)
  const cursor = useEditorStore((state) => state.cursorMm)
  const units = useUiStore((state) => state.preferences.units)
  const size = useDocumentStore((state) => state.labelSize)

  useEffect(() => {
    const horizontal = horizontalRef.current
    const vertical = verticalRef.current
    if (horizontal !== null)
      drawRuler(horizontal, 'horizontal', viewport, isDark, units, cursor?.x ?? null)
    if (vertical !== null)
      drawRuler(vertical, 'vertical', viewport, isDark, units, cursor?.y ?? null)
  }, [viewport, isDark, units, cursor])

  const position = (event: React.PointerEvent<HTMLCanvasElement>, axis: 'x' | 'y'): number => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const pixel = axis === 'x' ? event.clientX - bounds.left : event.clientY - bounds.top
    const origin = axis === 'x' ? viewport.originX : viewport.originY
    return (pixel - origin) / viewport.pxPerMm
  }
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerUp =
    (axis: 'x' | 'y') =>
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      onGuide(axis, position(event, axis))
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  const exact =
    (axis: 'x' | 'y') =>
    (event: React.MouseEvent<HTMLCanvasElement>): void => {
      const initial = roundMm(
        position(event as unknown as React.PointerEvent<HTMLCanvasElement>, axis)
      )
      const entered = window.prompt(
        `Guide position (${units})`,
        String(units === 'in' ? roundMm(initial / 25.4, 3) : initial)
      )
      if (entered === null) return
      try {
        onGuide(
          axis,
          parseMeasurement(entered, {
            defaultUnit: units,
            percentBaseMm: axis === 'x' ? size.widthMm : size.heightMm
          })
        )
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error))
      }
    }

  return (
    <>
      <div className={styles.corner} />
      <canvas
        ref={horizontalRef}
        className={mergeClasses(styles.strip, styles.horizontal)}
        title="Drag for a vertical guide; double-click for an exact position"
        onPointerDown={pointerDown}
        onPointerUp={pointerUp('x')}
        onDoubleClick={exact('x')}
      />
      <canvas
        ref={verticalRef}
        className={mergeClasses(styles.strip, styles.vertical)}
        title="Drag for a horizontal guide; double-click for an exact position"
        onPointerDown={pointerDown}
        onPointerUp={pointerUp('y')}
        onDoubleClick={exact('y')}
      />
    </>
  )
}
