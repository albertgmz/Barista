/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * Editor breadcrumbs.
 *
 * The log used to hold process lifecycle events only, so a bundle collected
 * after a barcode refused to encode or after the renderer died said nothing
 * about either. These are the few editor events that answer "what was being
 * done to the label just before this went wrong", and nothing more: counts,
 * object kinds, symbologies and encoder failure names. Object names, text,
 * barcode data, variable values and file paths never leave the renderer.
 *
 * Volume is kept down by reporting differences rather than events. A snapshot
 * of the document is compared with the previous one, so typing, dragging,
 * restyling and canvas rebuilds produce nothing at all; only adding or removing
 * an object, changing a symbology, changing which encoder error a barcode
 * raises, or changing the preflight totals does.
 */
import type { EditorBreadcrumb } from '@shared/diagnostics'
import type { PreflightIssue } from '@shared/preflight'
import type { LabelDocument, ObjectKind, VariableKind } from '@shared/template/types'

/** What the last report saw, reduced to the fields a breadcrumb can carry. */
export interface EditorSnapshot {
  /** Template id. Never reported; a change here means a different label. */
  template: string
  /** Object count per kind. */
  kinds: Partial<Record<ObjectKind, number>>
  /** Object id to symbology, for barcode and QR objects. */
  symbologies: Record<string, string>
  /** Object id to the encoder failure name its data currently raises. */
  failures: Record<string, string>
  /** Variable ids to kinds; names and values never leave this module. */
  variables: Record<string, VariableKind>
  errors: number
  warnings: number
}

/**
 * The encoder's failure name on its own.
 *
 * bwip-js messages read `bwipp.ean13badLength#2054: EAN-13 must be 12 or 13
 * digits`, and preflight prefixes them with the object's name
 * (`preflight.ts`: `${object.name} has invalid data: ${error}`). Only the name
 * after `bwipp.` is diagnostic; everything around it is the operator's own
 * wording, so it is dropped rather than trimmed.
 *
 * The **last** match is taken, not the first. An operator is free to name an
 * object `bwipp.9501101530003`, and since the name is always the prefix, the
 * first match would be that name rather than the failure. bwip-js's own
 * messages are fixed strings that never quote the data they rejected, so the
 * last match is always the encoder's.
 */
export function encoderFailureCode(message: string): string {
  const matches = [...message.matchAll(/bwipp\.([A-Za-z0-9]+)/g)]
  return matches.at(-1)?.[1] ?? 'unknown'
}

/** Reduces a document and its preflight report to the reportable fields. */
export function editorSnapshot(
  document: LabelDocument,
  issues: readonly PreflightIssue[]
): EditorSnapshot {
  const snapshot: EditorSnapshot = {
    template: document.template.id,
    kinds: {},
    symbologies: {},
    failures: {},
    variables: {},
    errors: 0,
    warnings: 0
  }
  for (const object of document.template.design.objects) {
    snapshot.kinds[object.kind] = (snapshot.kinds[object.kind] ?? 0) + 1
    if (object.kind === 'barcode') snapshot.symbologies[object.id] = object.symbology
    else if (object.kind === 'qrcode')
      snapshot.symbologies[object.id] = object.symbology ?? 'qrcode'
  }
  for (const variable of document.template.variables)
    snapshot.variables[variable.id] = variable.kind
  for (const issue of issues) {
    if (issue.severity === 'error') snapshot.errors += 1
    else if (issue.severity === 'warning') snapshot.warnings += 1
    if (issue.code === 'barcode.invalid' && issue.objectId)
      snapshot.failures[issue.objectId] = encoderFailureCode(issue.message)
  }
  return snapshot
}

/**
 * The breadcrumbs describing the change between two snapshots. The first
 * snapshot of a session reports nothing, and neither does the first of a
 * different label: what a document already contains is in the document, not in
 * the log, and opening one is not the same as drawing its objects.
 */
export function editorBreadcrumbs(
  next: EditorSnapshot,
  previous: EditorSnapshot | null
): EditorBreadcrumb[] {
  if (!previous || previous.template !== next.template) return []
  const breadcrumbs: EditorBreadcrumb[] = []
  const kinds = new Set([...Object.keys(previous.kinds), ...Object.keys(next.kinds)])
  for (const key of kinds) {
    const kind = key as ObjectKind
    const delta = (next.kinds[kind] ?? 0) - (previous.kinds[kind] ?? 0)
    if (delta > 0) breadcrumbs.push({ event: 'editor.objects-added', kind, count: delta })
    else if (delta < 0) breadcrumbs.push({ event: 'editor.objects-removed', kind, count: -delta })
  }
  for (const [id, to] of Object.entries(next.symbologies)) {
    const from = previous.symbologies[id]
    if (from !== undefined && from !== to)
      breadcrumbs.push({ event: 'editor.symbology-changed', from, to })
  }
  for (const [id, kind] of Object.entries(next.variables)) {
    const previousKind = previous.variables[id]
    if (previousKind === undefined)
      breadcrumbs.push({ event: 'editor.variable-created', kind, count: 1 })
    else if (previousKind !== kind)
      breadcrumbs.push({ event: 'editor.variable-kind-changed', from: previousKind, to: kind })
  }
  for (const [id, kind] of Object.entries(previous.variables)) {
    if (next.variables[id] === undefined)
      breadcrumbs.push({ event: 'editor.variable-deleted', kind, count: 1 })
  }
  for (const [id, code] of Object.entries(next.failures)) {
    const symbology = next.symbologies[id]
    // Only barcode and QR objects can fail to encode, so the symbology is
    // always known. Dropping the breadcrumb beats guessing one.
    if (symbology !== undefined && previous.failures[id] !== code)
      breadcrumbs.push({ event: 'editor.barcode-failed', symbology, code })
  }
  if (next.errors !== previous.errors || next.warnings !== previous.warnings)
    breadcrumbs.push({
      event: 'editor.preflight',
      errors: next.errors,
      warnings: next.warnings
    })
  return breadcrumbs
}

/** Records one breadcrumb. Diagnostics never interrupt what the operator is doing. */
export function sendBreadcrumb(breadcrumb: EditorBreadcrumb): void {
  void window.barista.invoke('diagnostics:breadcrumb', breadcrumb).catch(() => undefined)
}

let previous: EditorSnapshot | null = null

/**
 * Starts a new trail, so the next report is a baseline rather than a diff.
 *
 * Called whenever the editor swaps one label for another. The template id is a
 * backstop rather than the guard, because Save As copies it: without this,
 * opening a label and then its Save As variant would diff one against the other
 * and report additions and deletions nobody performed.
 */
export function resetEditorBreadcrumbs(): void {
  previous = null
}

/**
 * Reports what changed since the last call. Called from the preflight pass,
 * which already debounces a burst of edits and has computed the issue list.
 */
export function recordEditorState(
  document: LabelDocument,
  issues: readonly PreflightIssue[]
): void {
  const next = editorSnapshot(document, issues)
  for (const breadcrumb of editorBreadcrumbs(next, previous)) sendBreadcrumb(breadcrumb)
  previous = next
}
