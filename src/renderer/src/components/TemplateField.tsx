/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useId } from '@fluentui/react-components'
import type { LabelVariable } from '@shared/template/types'
import { evaluateVariables, templateSegments } from '@shared/variables'
import { useUiStore } from '../store/uiStore'
import { variableHue, variableTint } from '../editor/variableColor'
import {
  braceQuery,
  matchingVariables,
  withActiveOffset,
  withQuery,
  type AutocompleteState
} from './templateAutocomplete'

interface TemplateFieldProps {
  label: string
  value: string
  variables: readonly LabelVariable[]
  multiline?: boolean
  onChange: (value: string) => void
  onCreateVariable: () => string | null | Promise<string | null>
}

function chipFor(name: string): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.className = 'variable-chip'
  chip.contentEditable = 'false'
  chip.dataset['variable'] = name
  chip.style.setProperty('--variable-hue', `${variableHue(name)}`)
  chip.textContent = name
  return chip
}

function writeTemplate(element: HTMLElement, value: string): void {
  element.replaceChildren()
  for (const segment of templateSegments(value))
    element.append(
      segment.variable === null ? document.createTextNode(segment.text) : chipFor(segment.variable)
    )
}

function readTemplate(element: HTMLElement): string {
  const read = (node: Node): string => {
    if (node instanceof HTMLElement && node.dataset['variable'])
      return `{${node.dataset['variable']}}`
    if (node instanceof HTMLBRElement) return '\n'
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    return [...node.childNodes].map(read).join('')
  }
  return [...element.childNodes].map(read).join('')
}

export function TemplateField({
  label,
  value,
  variables,
  multiline = false,
  onChange,
  onCreateVariable
}: TemplateFieldProps): JSX.Element {
  const editor = useRef<HTMLDivElement>(null)
  const listbox = useRef<HTMLSpanElement>(null)
  const range = useRef<Range | null>(null)
  const lastLocalValue = useRef(value)
  const [open, setOpen] = useState(false)
  const [suggest, setSuggest] = useState<AutocompleteState>({ query: '', activeIndex: 0 })
  const listId = useId('variable-autocomplete-')
  const matches = matchingVariables(variables, suggest.query)
  const optionCount = matches.length + 1
  // The canvas shows resolved values and this field shows the expression, so
  // the chip carries the value it stands for, resolved the way the canvas
  // resolves it. Written on hover because a chip outlives edits to the variable
  // behind it.
  const preview = useUiStore((state) => state.previewFields)
  const resolved = useMemo(
    () => evaluateVariables(variables, { sample: !preview, fields: preview ?? undefined }).values,
    [variables, preview]
  )
  const describeChip = (target: EventTarget): void => {
    const chip = target instanceof Element ? target.closest('.variable-chip') : null
    if (chip instanceof HTMLElement && chip.dataset['variable'])
      chip.title = resolved[chip.dataset['variable']] || '—'
  }

  useEffect(() => {
    if (
      editor.current &&
      (document.activeElement !== editor.current || value !== lastLocalValue.current)
    )
      writeTemplate(editor.current, value)
    lastLocalValue.current = value
  }, [value])

  useEffect(() => {
    if (!open) return
    const option = listbox.current?.children[suggest.activeIndex]
    if (option instanceof HTMLElement) option.scrollIntoView({ block: 'nearest' })
  }, [open, suggest.activeIndex])

  const emit = (next: string): void => {
    lastLocalValue.current = next
    onChange(next)
  }

  /** Tracks what has been typed since the `{`, and closes once the caret leaves the token. */
  const syncQuery = (root: HTMLElement): void => {
    const selection = window.getSelection()
    const caret = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (!caret || !root.contains(caret.startContainer)) {
      setOpen(false)
      return
    }
    const before = document.createRange()
    before.selectNodeContents(root)
    before.setEnd(caret.startContainer, caret.startOffset)
    const query = braceQuery(before.toString())
    if (query === null) setOpen(false)
    else setSuggest((state) => withQuery(state, query))
  }
  const rememberRange = (): void => {
    const selection = window.getSelection()
    if (selection?.rangeCount) range.current = selection.getRangeAt(0).cloneRange()
    if (open && editor.current) syncQuery(editor.current)
  }
  const insert = (name: string, consumed: number): void => {
    const root = editor.current
    if (!root) return
    const insertion = range.current
    const chip = chipFor(name)
    const trailing = document.createTextNode('')
    if (insertion && root.contains(insertion.startContainer)) {
      // Leave the typed text alone unless all of it sits before a collapsed
      // caret in one text node; eating a neighbour would be worse.
      if (
        insertion.collapsed &&
        insertion.startContainer.nodeType === Node.TEXT_NODE &&
        insertion.startOffset >= consumed
      ) {
        const removeTyped = insertion.cloneRange()
        removeTyped.setStart(insertion.startContainer, insertion.startOffset - consumed)
        removeTyped.deleteContents()
      }
      insertion.insertNode(trailing)
      insertion.insertNode(chip)
    } else root.append(chip, trailing)
    const selection = window.getSelection()
    const next = document.createRange()
    next.setStart(trailing, 0)
    next.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(next)
    range.current = next.cloneRange()
    emit(readTemplate(root))
    setOpen(false)
    root.focus()
  }
  /** Inserts the option at `index`; the entry past the matches creates a variable. */
  const choose = async (index: number): Promise<void> => {
    const consumed = suggest.query.length + 1
    const match = matches[index]
    if (match) insert(match.name, consumed)
    else if (index === matches.length) {
      const created = await onCreateVariable()
      if (created) insert(created, consumed)
    }
  }

  return (
    <label className="template-field-label">
      {label}
      <span className="template-field-wrap">
        <div
          ref={editor}
          role="textbox"
          aria-label={label}
          aria-multiline={multiline}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${suggest.activeIndex}` : undefined}
          className={`template-field ${multiline ? 'multiline' : ''}`}
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => {
            emit(readTemplate(event.currentTarget))
            syncQuery(event.currentTarget)
          }}
          onKeyDown={(event) => {
            if (!multiline && event.key === 'Enter') event.preventDefault()
            if (open) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const offset = event.key === 'ArrowDown' ? 1 : -1
                setSuggest((state) => withActiveOffset(state, offset, optionCount))
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                void choose(suggest.activeIndex)
                return
              }
            }
            if (event.key === '{')
              queueMicrotask(() => {
                setSuggest({ query: '', activeIndex: 0 })
                setOpen(true)
              })
            if (event.key === 'Escape' && open) {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
            }
          }}
          onKeyUp={rememberRange}
          onMouseUp={rememberRange}
          onMouseOver={(event) => describeChip(event.target)}
          onBlur={() => setOpen(false)}
          onPaste={(event) => {
            event.preventDefault()
            document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
          }}
        />
        {open ? (
          <span
            ref={listbox}
            id={listId}
            className="variable-autocomplete"
            role="listbox"
            aria-label="Variable autocomplete"
            onMouseDown={(event) => event.preventDefault()}
          >
            {matches.map((variable, index) => (
              <button
                key={variable.id}
                id={`${listId}-${index}`}
                type="button"
                data-active={index === suggest.activeIndex}
                onClick={() => void choose(index)}
              >
                <span className="variable-label">
                  <span
                    className="variable-swatch"
                    style={variableTint(variable.name)}
                    aria-hidden
                  />
                  {variable.name}
                </span>
                <small>{variable.kind}</small>
              </button>
            ))}
            <button
              id={`${listId}-${matches.length}`}
              type="button"
              data-active={matches.length === suggest.activeIndex}
              onClick={() => void choose(matches.length)}
            >
              Create new variable…
            </button>
          </span>
        ) : null}
      </span>
    </label>
  )
}
