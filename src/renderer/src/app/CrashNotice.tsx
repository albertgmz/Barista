/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useState, type JSX } from 'react'
import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle
} from '@fluentui/react-components'
import type { CrashNotice as CrashNoticeValue } from '@shared/diagnostics'

export function CrashNotice(): JSX.Element | null {
  const [notice, setNotice] = useState<CrashNoticeValue | null>(null)
  const [contents, setContents] = useState<string | null>(null)
  useEffect(() => {
    void window.barista.invoke('diagnostics:crashNotice').then(setNotice)
  }, [])
  if (!notice) return null
  const dismiss = (): void => {
    void window.barista.invoke('diagnostics:dismissCrashNotice', { id: notice.id })
    setNotice(null)
  }
  const view = async (): Promise<void> => {
    const result = await window.barista.invoke('diagnostics:viewBundle', { path: notice.path })
    if (result.ok)
      setContents(`${result.value.summary}\n\nFiles:\n${result.value.entries.join('\n')}`)
  }
  return (
    <MessageBar intent="warning">
      <MessageBarBody>
        <MessageBarTitle>Barista closed unexpectedly.</MessageBarTitle> A diagnostic report was
        saved.
        {contents ? (
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{contents}</pre>
        ) : null}
      </MessageBarBody>
      <MessageBarActions
        containerAction={
          <Button appearance="transparent" onClick={dismiss}>
            Dismiss
          </Button>
        }
      >
        <Button
          onClick={() => void window.barista.invoke('diagnostics:showFile', { path: notice.path })}
        >
          Show file
        </Button>
        <Button onClick={() => void view()}>View contents</Button>
      </MessageBarActions>
    </MessageBar>
  )
}
