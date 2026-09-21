/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useMemo, useState, type JSX } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { preflight, type PreflightSeverity } from '@shared/preflight'
import { canvasTextMeasurer } from '../editor/textMeasure'
import { useDocumentStore, useEditorStore, useUiStore } from '../store'

const useStyles = makeStyles({
  root: { padding: tokens.spacingHorizontalS, display: 'grid', gap: tokens.spacingVerticalS },
  summary: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  list: { display: 'grid', gap: '2px' },
  issue: {
    border: 0,
    borderRadius: tokens.borderRadiusMedium,
    background: 'transparent',
    color: tokens.colorNeutralForeground1,
    padding: tokens.spacingVerticalXS,
    textAlign: 'left',
    cursor: 'pointer',
    ':hover': { background: tokens.colorNeutralBackground1Hover }
  },
  error: { borderLeft: `3px solid ${tokens.colorPaletteRedBorderActive}` },
  warning: { borderLeft: `3px solid ${tokens.colorPaletteYellowBorderActive}` },
  info: { borderLeft: `3px solid ${tokens.colorBrandStroke1}` },
  code: {
    display: 'block',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100
  }
})

export function PreflightPanel(): JSX.Element {
  const styles = useStyles()
  const document = useDocumentStore((state) => state.document)
  const fields = useUiStore((state) => state.previewFields)
  const [fonts, setFonts] = useState<string[]>()
  useEffect(() => {
    let active = true
    void window.barista.invoke('fonts:list').then((response) => {
      if (active && response.ok)
        setFonts(response.value.families.flatMap((font) => [font.family, ...font.aliases]))
    })
    return () => {
      active = false
    }
  }, [])
  const report = useMemo(
    () =>
      preflight(document, {
        fields: fields ?? undefined,
        installedFonts: fonts,
        measureText: canvasTextMeasurer
      }),
    [document, fields, fonts]
  )
  const select = (objectId?: string): void => {
    if (!objectId) return
    useEditorStore.getState().setSelectedIds([objectId])
    useEditorStore.getState().requestZoomToSelection()
  }
  const classFor = (severity: PreflightSeverity): string => styles[severity]
  return (
    <section className={styles.root} aria-label="Preflight results">
      <div className={styles.summary} role="status">
        <strong>{report.errors} errors</strong>
        <span>{report.warnings} warnings</span>
        <span>{report.info} info</span>
      </div>
      {!report.issues.length ? <p>No preflight issues.</p> : null}
      <div className={styles.list}>
        {report.issues.map((item, index) => (
          <button
            type="button"
            className={`${styles.issue} ${classFor(item.severity)}`}
            key={`${item.code}:${item.objectId ?? ''}:${index}`}
            onClick={() => select(item.objectId)}
            disabled={!item.objectId}
          >
            {item.message}
            <span className={styles.code}>
              {item.severity.toUpperCase()} · {item.code}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
