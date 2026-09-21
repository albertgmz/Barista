/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect } from 'react'

/**
 * Stops Ctrl+wheel from zooming the whole page. The listener is non-passive so
 * that `preventDefault` is honoured, and it only prevents the default action:
 * the event still reaches the canvas, which uses it to zoom the label.
 */
export function usePageZoomGuard(): void {
  useEffect(() => {
    const handle = (event: WheelEvent): void => {
      if (event.ctrlKey) {
        event.preventDefault()
      }
    }

    window.addEventListener('wheel', handle, { passive: false, capture: true })

    return () => {
      window.removeEventListener('wheel', handle, { capture: true })
    }
  }, [])
}
