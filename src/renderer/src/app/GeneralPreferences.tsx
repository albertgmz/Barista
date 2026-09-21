/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { Dispatch, JSX, SetStateAction } from 'react'
import { Checkbox, Field, Input, Select, makeStyles, tokens } from '@fluentui/react-components'
import type { AppSettings } from '@shared/settings'

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingVerticalM },
  span: { gridColumn: '1 / -1' },
  checks: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingVerticalXS }
})

export interface GeneralPreferencesProps {
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
}

export function GeneralPreferences({ draft, setDraft }: GeneralPreferencesProps): JSX.Element {
  const styles = useStyles()
  const number = (key: keyof AppSettings, value: string): void =>
    setDraft((state) => ({ ...state, [key]: Number(value) }))

  return (
    <div className={styles.grid}>
      <Field label="Measurement units">
        <Select
          value={draft.units}
          onChange={(event) =>
            setDraft((state) => ({ ...state, units: event.target.value as 'mm' | 'in' }))
          }
        >
          <option value="mm">Millimetres</option>
          <option value="in">Inches</option>
        </Select>
      </Field>
      <Field label="Theme">
        <Select
          value={draft.theme}
          onChange={(event) =>
            setDraft((state) => ({
              ...state,
              theme: event.target.value as AppSettings['theme']
            }))
          }
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">Use system setting</option>
        </Select>
      </Field>
      <Field label="Small nudge (mm)">
        <Input
          type="number"
          min={0.001}
          step={0.001}
          value={String(draft.nudgeSmallMm)}
          onChange={(_, data) => number('nudgeSmallMm', data.value)}
        />
      </Field>
      <Field label="Large nudge (mm)">
        <Input
          type="number"
          min={0.001}
          step={0.1}
          value={String(draft.nudgeLargeMm)}
          onChange={(_, data) => number('nudgeLargeMm', data.value)}
        />
      </Field>
      <Field label="Grid spacing (mm)">
        <Input
          type="number"
          min={0.1}
          step={0.1}
          value={String(draft.gridSizeMm)}
          onChange={(_, data) => number('gridSizeMm', data.value)}
        />
      </Field>
      <Field label="Grid subdivisions">
        <Input
          type="number"
          min={1}
          max={20}
          step={1}
          value={String(draft.gridSubdivisions)}
          onChange={(_, data) => number('gridSubdivisions', data.value)}
        />
      </Field>
      <Field label="Default label width (mm)">
        <Input
          type="number"
          min={1}
          value={String(draft.defaultLabel.widthMm)}
          onChange={(_, data) =>
            setDraft((state) => ({
              ...state,
              defaultLabel: { ...state.defaultLabel, widthMm: Number(data.value) }
            }))
          }
        />
      </Field>
      <Field label="Default label height (mm)">
        <Input
          type="number"
          min={1}
          value={String(draft.defaultLabel.heightMm)}
          onChange={(_, data) =>
            setDraft((state) => ({
              ...state,
              defaultLabel: { ...state.defaultLabel, heightMm: Number(data.value) }
            }))
          }
        />
      </Field>
      <Field label="Default printer DPI">
        <Select
          value={String(draft.defaultLabel.dpi)}
          onChange={(event) =>
            setDraft((state) => ({
              ...state,
              defaultLabel: {
                ...state.defaultLabel,
                dpi: Number(event.target.value) as 203 | 300 | 600
              }
            }))
          }
        >
          <option value="203">203 DPI</option>
          <option value="300">300 DPI</option>
          <option value="600">600 DPI</option>
        </Select>
      </Field>
      <Field label="Autosave interval (minutes)">
        <Input
          type="number"
          min={1}
          max={60}
          value={String(draft.autosaveMinutes)}
          onChange={(_, data) => number('autosaveMinutes', data.value)}
        />
      </Field>
      <Field label="Preflight before printing">
        <Select
          value={draft.preflightMode}
          onChange={(event) =>
            setDraft((state) => ({
              ...state,
              preflightMode: event.target.value as AppSettings['preflightMode']
            }))
          }
        >
          <option value="warn">Warn only</option>
          <option value="strict">Block printing on errors</option>
        </Select>
      </Field>
      <Field label="Default application mode">
        <Select
          value={draft.defaultMode}
          onChange={(event) =>
            setDraft((state) => ({
              ...state,
              defaultMode: event.target.value as AppSettings['defaultMode']
            }))
          }
        >
          <option value="editor">Label editor</option>
          <option value="station">Print Station</option>
        </Select>
      </Field>
      <Field label="Calibrated screen DPI" hint="Used by View > Actual Size.">
        <Input
          type="number"
          min={50}
          max={400}
          step={0.1}
          value={String(draft.screenDpi)}
          onChange={(_, data) => number('screenDpi', data.value)}
        />
      </Field>
      <div className={styles.span}>
        <Field label="Snapping">
          <div className={styles.checks}>
            {(
              [
                ['grid', 'Grid'],
                ['guides', 'Guides'],
                ['label', 'Label edges and centre'],
                ['objects', 'Object edges and centres'],
                ['printerDots', 'Printer dots']
              ] as const
            ).map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={draft.snap[key]}
                onChange={(_, data) =>
                  setDraft((state) => ({
                    ...state,
                    snap: { ...state.snap, [key]: data.checked === true }
                  }))
                }
              />
            ))}
          </div>
        </Field>
      </div>
    </div>
  )
}
