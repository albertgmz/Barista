/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { afterEach, describe, expect, it } from 'vitest'
import { createDocument, createObject } from '@shared/template/document'
import type { PreflightIssue } from '@shared/preflight'
import type { LabelDocument, LabelObject } from '@shared/template/types'
import type { EditorBreadcrumb } from '@shared/diagnostics'
import {
  editorBreadcrumbs,
  editorSnapshot,
  encoderFailureCode,
  recordEditorState,
  resetEditorBreadcrumbs
} from './breadcrumbs'

/** Captures what `sendBreadcrumb` would put on the wire. */
function captureBreadcrumbs(): EditorBreadcrumb[] {
  const sent: EditorBreadcrumb[] = []
  ;(globalThis as { window?: unknown }).window = {
    barista: {
      invoke: (_channel: string, breadcrumb: EditorBreadcrumb) => {
        sent.push(breadcrumb)
        return Promise.resolve()
      }
    }
  }
  return sent
}

afterEach(() => {
  resetEditorBreadcrumbs()
  delete (globalThis as { window?: unknown }).window
})

/** The same label throughout, so a diff compares versions of one document. */
function withObjects(objects: LabelObject[], id = 'label-1'): LabelDocument {
  const document = createDocument()
  return {
    ...document,
    template: { ...document.template, id, design: { ...document.template.design, objects } }
  }
}

function barcode(id: string, symbology: string): LabelObject {
  const object = createObject('barcode', 2, 2)
  if (object.kind !== 'barcode') throw new Error('createObject returned the wrong kind')
  return { ...object, id, symbology: symbology as typeof object.symbology }
}

function text(content: string): LabelObject {
  const object = createObject('text', 1, 1)
  if (object.kind !== 'text') throw new Error('createObject returned the wrong kind')
  return { ...object, text: content }
}

const invalid = (objectId: string, message: string): PreflightIssue => ({
  code: 'barcode.invalid',
  severity: 'error',
  message,
  objectId,
  objectName: 'Customer address'
})

describe('editor breadcrumbs', () => {
  it('takes the encoder failure name even when an object is named like one', () => {
    // Preflight prefixes the encoder message with the object's name, and an
    // operator may name an object anything at all.
    expect(
      encoderFailureCode(
        'bwipp.AcmeCoffee9501101530003 has invalid data: bwipp.ean13badLength#2054: too short'
      )
    ).toBe('ean13badLength')
  })

  it('drops a failure whose object has no symbology rather than guessing one', () => {
    const before = editorSnapshot(withObjects([]), [])
    const after = { ...before, failures: { ghost: 'ean13badLength' } }
    expect(editorBreadcrumbs(after, before)).toEqual([])
  })

  it('starts a new trail after a reset, so two labels are never diffed', () => {
    const sent = captureBreadcrumbs()
    // Save As keeps the template id, so the id alone cannot separate them.
    const first = withObjects([text('one'), text('two'), barcode('b1', 'code128')])
    const second = withObjects([text('one')])
    recordEditorState(first, [])
    recordEditorState(second, [])
    // Without the reset the second label is diffed against the first, which
    // reports deletions nobody performed.
    expect(sent.map((b) => b.event)).toEqual(['editor.objects-removed', 'editor.objects-removed'])
    sent.length = 0
    resetEditorBreadcrumbs()
    recordEditorState(first, [])
    recordEditorState(first, [])
    expect(sent).toEqual([])
  })

  it('reports an added object through the wire', () => {
    const sent = captureBreadcrumbs()
    recordEditorState(withObjects([]), [])
    recordEditorState(withObjects([barcode('b1', 'code128')]), [])
    expect(sent).toEqual([{ event: 'editor.objects-added', kind: 'barcode', count: 1 }])
  })

  it('keeps only the encoder failure name, not the message around it', () => {
    expect(
      encoderFailureCode(
        'Customer address has invalid data: bwipp.ean13badLength#2054: EAN-13 must be 12 or 13 digits'
      )
    ).toBe('ean13badLength')
    expect(
      encoderFailureCode('Barcode 1 has invalid data: bwipp.GS1aiMissingOpenParen#2949: x')
    ).toBe('GS1aiMissingOpenParen')
    expect(encoderFailureCode('something else entirely')).toBe('unknown')
  })

  it('reduces a document to counts, symbologies and failure names', () => {
    const document = withObjects([barcode('b1', 'ean13'), createObject('text', 1, 1)])
    const snapshot = editorSnapshot(document, [
      invalid('b1', 'Customer address has invalid data: bwipp.ean13badLength#2054: too short'),
      { code: 'text.overflow', severity: 'warning', message: 'Customer address overflows.' }
    ])
    expect(snapshot.kinds).toEqual({ barcode: 1, text: 1 })
    expect(snapshot.symbologies).toEqual({ b1: 'ean13' })
    expect(snapshot.failures).toEqual({ b1: 'ean13badLength' })
    expect(snapshot.errors).toBe(1)
    expect(snapshot.warnings).toBe(1)
    expect(JSON.stringify(snapshot)).not.toContain('Customer address')
  })

  it('reports nothing for the first snapshot or for a different label', () => {
    const first = editorSnapshot(withObjects([barcode('b1', 'code128')]), [])
    expect(editorBreadcrumbs(first, null)).toEqual([])
    const other = editorSnapshot(withObjects([], 'another-label'), [])
    expect(editorBreadcrumbs(other, first)).toEqual([])
  })

  it('reports objects added and removed by kind only', () => {
    const before = editorSnapshot(withObjects([createObject('text', 1, 1)]), [])
    const after = editorSnapshot(withObjects([barcode('b1', 'code128')]), [])
    const breadcrumbs = editorBreadcrumbs(after, before)
    expect(breadcrumbs).toContainEqual({ event: 'editor.objects-added', kind: 'barcode', count: 1 })
    expect(breadcrumbs).toContainEqual({ event: 'editor.objects-removed', kind: 'text', count: 1 })
  })

  it('reports variable lifecycle changes by kind without names or values', () => {
    const before = editorSnapshot(withObjects([]), [])
    const document = withObjects([])
    const counter = {
      id: 'variable-1',
      name: 'Customer serial',
      kind: 'counter' as const,
      start: 1,
      step: 1,
      min: 1,
      max: 99,
      padding: 4,
      padChar: '0',
      prefix: '',
      suffix: '',
      format: 'numeric' as const,
      alphabet: '',
      scope: 'template' as const,
      sharedName: '',
      overflow: 'stop' as const,
      reset: 'never' as const,
      failure: 'void' as const
    }
    const after = editorSnapshot(
      { ...document, template: { ...document.template, variables: [counter] } },
      []
    )
    expect(editorBreadcrumbs(after, before)).toContainEqual({
      event: 'editor.variable-created',
      kind: 'counter',
      count: 1
    })
    expect(JSON.stringify(after)).not.toContain('Customer serial')
  })

  it('reports a symbology change as a pair of symbologies', () => {
    const before = editorSnapshot(withObjects([barcode('b1', 'code128')]), [])
    const after = editorSnapshot(withObjects([barcode('b1', 'ean13')]), [])
    expect(editorBreadcrumbs(after, before)).toContainEqual({
      event: 'editor.symbology-changed',
      from: 'code128',
      to: 'ean13'
    })
  })

  it('reports a barcode failure once per code, not once per keystroke', () => {
    const document = withObjects([barcode('b1', 'ean13')])
    const clean = editorSnapshot(document, [])
    const message = 'Customer address has invalid data: bwipp.ean13badLength#2054: too short'
    const failing = editorSnapshot(document, [invalid('b1', message)])
    const first = editorBreadcrumbs(failing, clean)
    expect(first).toContainEqual({
      event: 'editor.barcode-failed',
      symbology: 'ean13',
      code: 'ean13badLength'
    })
    expect(JSON.stringify(first)).not.toContain('Customer address')
    // The same failure still standing after another edit says nothing new.
    const again = editorSnapshot(document, [invalid('b1', message)])
    expect(editorBreadcrumbs(again, failing)).toEqual([])
  })

  it('says nothing when only the text of an object changes', () => {
    const before = editorSnapshot(withObjects([createObject('text', 1, 1)]), [])
    const edited = withObjects([text('Acme Coffee')])
    const after = editorSnapshot(edited, [])
    expect(editorBreadcrumbs(after, before)).toEqual([])
  })

  it('reports preflight totals when they move', () => {
    const document = withObjects([createObject('text', 1, 1)])
    const before = editorSnapshot(document, [])
    const after = editorSnapshot(document, [
      { code: 'text.overflow', severity: 'error', message: 'Customer address overflows.' }
    ])
    expect(editorBreadcrumbs(after, before)).toEqual([
      { event: 'editor.preflight', errors: 1, warnings: 0 }
    ])
  })
})
