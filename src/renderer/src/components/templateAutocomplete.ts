/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */

/*
 * Filter and active-option state for the `{` autocomplete in `TemplateField`.
 * It is kept apart from the component because the test environment is Node
 * without a DOM, so only plain functions are reachable from a test.
 */

export interface AutocompleteVariable {
  readonly name: string
}

export interface AutocompleteState {
  readonly query: string
  readonly activeIndex: number
}

const namePart = /^[A-Za-z0-9_-]*$/

/**
 * The characters typed since the `{` that opened a token, or `null` when the
 * caret is not inside one - no brace, a closed token, or a character that
 * cannot appear in a variable name.
 */
export function braceQuery(textBeforeCaret: string): string | null {
  const brace = textBeforeCaret.lastIndexOf('{')
  if (brace < 0) return null
  const typed = textBeforeCaret.slice(brace + 1)
  return namePart.test(typed) ? typed : null
}

export function matchingVariables<T extends AutocompleteVariable>(
  variables: readonly T[],
  query: string
): T[] {
  const needle = query.toLowerCase()
  return variables.filter((variable) => variable.name.toLowerCase().includes(needle))
}

/** A narrower filter shows a different list, so the active option starts over. */
export function withQuery(state: AutocompleteState, query: string): AutocompleteState {
  return state.query === query ? state : { query, activeIndex: 0 }
}

/** Moves the active option, wrapping at both ends. `count` includes the create entry. */
export function withActiveOffset(
  state: AutocompleteState,
  offset: number,
  count: number
): AutocompleteState {
  return { ...state, activeIndex: (((state.activeIndex + offset) % count) + count) % count }
}
