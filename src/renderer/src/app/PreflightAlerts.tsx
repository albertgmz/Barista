/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useRef } from 'react'
import { Link, ToastTrigger } from '@fluentui/react-components'
import { preflight } from '@shared/preflight'
import type { PreflightIssue } from '@shared/preflight'
import { useCommands } from '../commands/context'
import { revealPanel } from '../panels/dockFocus'
import { recordEditorState } from '../diagnostics/breadcrumbs'
import { useDocumentStore, useEditorStore } from '../store'
import { canvasTextMeasurer } from '../editor/textMeasure'
import { diffPreflightErrors } from './preflightDiff'

/** Let a burst of edits settle before preflighting, as the workspace save does. */
const SETTLE_MS = 250

function show(issue: PreflightIssue): void {
  if (issue.objectId) {
    useEditorStore.getState().setSelectedIds([issue.objectId])
    useEditorStore.getState().requestZoomToSelection()
  }
  revealPanel('preflight')
}

/**
 * Announces preflight errors the design did not have a moment ago, because the Preflight
 * panel is only mounted while its tab is on screen. Errors that are already there stay
 * silent, so an unfixed problem does not toast on every edit, and one edit raises a single
 * toast however many errors it introduced — shrinking the stock can put every object
 * outside it at once. The report reads sample values: preview records are only ever chosen
 * inside Print, the data-source dialog or Print Station, which report preflight themselves.
 */
export function PreflightAlerts(): null {
  const { notify } = useCommands()
  const document = useDocumentStore((state) => state.document)
  const known = useRef<string[] | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const issues = preflight(document, { measureText: canvasTextMeasurer }).issues
      recordEditorState(document, issues)
      const { introduced, keys } = diffPreflightErrors(issues, known.current)
      known.current = keys
      const first = introduced[0]
      if (!first) return
      notify({
        title: introduced.length > 1 ? `${introduced.length} preflight errors` : 'Preflight error',
        body: first.message,
        intent: 'error',
        action: (
          <ToastTrigger>
            <Link onClick={() => show(first)}>
              {first.objectId ? 'Show object' : 'Open Preflight'}
            </Link>
          </ToastTrigger>
        )
      })
    }, SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [document, notify])
  return null
}
