/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useState, type JSX } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { DiagnosticBundleResult } from '@shared/diagnostics'
import { useDocumentStore, useUiStore } from '../store'
import { getLastPrintData } from './diagnosticContext'

const useStyles = makeStyles({
  surface: { width: 'min(720px, 92vw)', maxWidth: '720px' },
  content: { display: 'grid', gap: tokens.spacingVerticalM },
  warning: { color: tokens.colorPaletteDarkOrangeForeground2 },
  result: { display: 'grid', gap: tokens.spacingVerticalS },
  actions: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  contents: {
    whiteSpace: 'pre-wrap',
    maxHeight: '220px',
    overflowY: 'auto',
    padding: tokens.spacingVerticalS,
    background: tokens.colorNeutralBackground2,
    fontFamily: 'JetBrains Mono',
    fontSize: '12px'
  }
})

export function DiagnosticReportDialog(): JSX.Element {
  const styles = useStyles()
  const open = useUiStore((state) => state.isDiagnosticReportOpen)
  const setOpen = useUiStore((state) => state.setDiagnosticReportOpen)
  const currentPath = useDocumentStore((state) => state.filePath)
  const [description, setDescription] = useState('')
  const [includeDocument, setIncludeDocument] = useState(false)
  const [includePrintData, setIncludePrintData] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DiagnosticBundleResult | null>(null)
  const [contents, setContents] = useState<string | null>(null)
  const printData = getLastPrintData()

  const create = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setContents(null)
    const response = await window.barista.invoke('diagnostics:create', {
      description,
      includeCurrentDocument: includeDocument,
      currentDocumentPath: includeDocument ? currentPath : null,
      includeLastPrintData: includePrintData,
      lastPrintData: includePrintData ? printData : null
    })
    setBusy(false)
    if (response.ok) setResult(response.value)
    else setError(response.error.message)
  }
  const view = async (): Promise<void> => {
    if (!result) return
    const response = await window.barista.invoke('diagnostics:viewBundle', { path: result.path })
    if (response.ok)
      setContents(`${response.value.summary}\n\nFiles:\n${response.value.entries.join('\n')}`)
    else setError(response.error.message)
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogSurface className={styles.surface} aria-describedby={undefined}>
        <DialogBody>
          <DialogTitle>Create Diagnostic Report</DialogTitle>
          <DialogContent className={styles.content}>
            <Text>
              Barista saves this ZIP locally. It never uploads or sends diagnostic information.
            </Text>
            <Textarea
              aria-label="What were you doing when the problem happened?"
              placeholder="What were you doing when the problem happened?"
              resize="vertical"
              value={description}
              onChange={(_, data) => setDescription(data.value)}
            />
            <Checkbox
              checked={includeDocument}
              disabled={!currentPath?.toLowerCase().endsWith('.bar')}
              label="Include the currently open .bar file"
              onChange={(_, data) => setIncludeDocument(data.checked === true)}
            />
            <Checkbox
              checked={includePrintData}
              disabled={printData === null}
              label="Include the last print job's resolved data"
              onChange={(_, data) => setIncludePrintData(data.checked === true)}
            />
            {(includeDocument || includePrintData) && (
              <Text size={200} className={styles.warning}>
                These optional files contain label content or print data. Inspect the ZIP before
                sharing it.
              </Text>
            )}
            {busy ? <Spinner label="Creating diagnostic report…" /> : null}
            {error ? (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            ) : null}
            {result ? (
              <div className={styles.result}>
                <Text weight="semibold">Saved as {result.fileName}</Text>
                <div className={styles.actions}>
                  <Button
                    onClick={() =>
                      void window.barista.invoke('diagnostics:showFile', { path: result.path })
                    }
                  >
                    Show file
                  </Button>
                  <Button onClick={() => void view()}>View contents</Button>
                  <Button onClick={() => void window.barista.invoke('diagnostics:openFolder')}>
                    Open containing folder
                  </Button>
                </div>
              </div>
            ) : null}
            {contents ? <pre className={styles.contents}>{contents}</pre> : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Close</Button>
            <Button appearance="primary" disabled={busy} onClick={() => void create()}>
              Create Report
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
