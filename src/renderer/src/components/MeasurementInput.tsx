/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { parseMeasurement, roundMm } from '@shared/units'
import { useUiStore } from '../store'

interface MeasurementInputProps {
  label: string
  value: number | undefined
  min?: number
  max?: number
  percentBaseMm?: number
  physical?: boolean
  onChange: (value: number) => void
}

export function MeasurementInput({
  label,
  value,
  min = -10000,
  max = 10000,
  percentBaseMm,
  physical = true,
  onChange
}: MeasurementInputProps): JSX.Element {
  const preferences = useUiStore((state) => state.preferences)
  const input = useRef<HTMLInputElement | null>(null)
  const display = useCallback(
    (next: number | undefined): string => {
      if (next === undefined) return ''
      return String(roundMm(physical && preferences.units === 'in' ? next / 25.4 : next))
    },
    [physical, preferences.units]
  )
  const [text, setText] = useState(display(value))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (document.activeElement === input.current) return undefined
    const timer = window.setTimeout(() => setText(display(value)), 0)
    return () => window.clearTimeout(timer)
  }, [value, display])

  const parse = (source: string): number =>
    parseMeasurement(source, {
      defaultUnit: physical ? preferences.units : 'mm',
      percentBaseMm
    })
  const commit = (source = text): boolean => {
    try {
      const next = parse(source)
      if (next < min || next > max) throw new Error(`${label} must be between ${min} and ${max}.`)
      onChange(next)
      setText(display(next))
      setError(null)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      return false
    }
  }
  const scrub = (event: React.PointerEvent<HTMLSpanElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const start = value ?? 0
    const move = (moveEvent: PointerEvent): void => {
      const multiplier = moveEvent.shiftKey ? 10 : moveEvent.altKey ? 0.1 : 1
      const next = Math.min(
        max,
        Math.max(min, roundMm(start + (moveEvent.clientX - startX) * 0.1 * multiplier))
      )
      onChange(next)
      setText(display(next))
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish, { once: true })
  }

  return (
    <label title={error ?? 'Drag the label to scrub; enter units, math or a percentage.'}>
      <span onPointerDown={scrub} style={{ cursor: 'ew-resize' }}>
        {label.replace('(mm)', physical ? `(${preferences.units})` : '')}
      </span>
      <input
        ref={input}
        aria-label={label}
        aria-invalid={!!error}
        type="text"
        value={text}
        placeholder={value === undefined ? 'Mixed' : undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (commit()) input.current?.blur()
            return
          }
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          const current = (() => {
            try {
              return parse(text)
            } catch {
              return value ?? 0
            }
          })()
          const base = physical ? preferences.nudgeSmallMm : 1
          const step = base * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1)
          const next = Math.min(
            max,
            Math.max(min, roundMm(current + (event.key === 'ArrowUp' ? step : -step)))
          )
          onChange(next)
          setText(display(next))
          setError(null)
        }}
      />
    </label>
  )
}
