/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useRef } from 'react'
import type { JSX } from 'react'
import { PANEL_WIDTH_MAX, PANEL_WIDTH_MIN, clampPanelWidth } from '@shared/workspace'

interface PanelResizerProps {
  width: number
  onChange: (width: number) => void
}

/** Splitter for the panel column. The column sits to its right, so dragging left widens it. */
export function PanelResizer({ width, onChange }: PanelResizerProps): JSX.Element {
  const handle = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; startWidth: number; moved: boolean } | null>(null)
  const resize = (next: number): void =>
    onChange(clampPanelWidth(next, handle.current?.parentElement?.clientWidth))
  const finish = (cancel = false): void => {
    const moving = drag.current
    drag.current = null
    if (cancel && moving?.moved) resize(moving.startWidth)
  }
  return (
    <div
      ref={handle}
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel column"
      aria-valuenow={width}
      aria-valuemin={PANEL_WIDTH_MIN}
      aria-valuemax={PANEL_WIDTH_MAX}
      tabIndex={0}
      title="Drag to resize the panel column"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        drag.current = { startX: event.clientX, startWidth: width, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const moving = drag.current
        if (!moving) return
        const delta = moving.startX - event.clientX
        if (!moving.moved && Math.abs(delta) < 5) return
        moving.moved = true
        resize(moving.startWidth + delta)
      }}
      onPointerUp={() => finish()}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') finish(true)
        const step = event.key === 'ArrowLeft' ? 10 : event.key === 'ArrowRight' ? -10 : 0
        if (!step) return
        event.preventDefault()
        resize(width + step)
      }}
    />
  )
}
