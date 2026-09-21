/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/**
 * The per-object "Data Source" concept is a *view* over `template.variables`:
 * an object's value stays a plain expression string, so nothing here changes
 * the `.bar` document format. These helpers classify that expression, and
 * rewrite it when the operator picks a different source.
 */
import type { LabelDocument, LabelVariable, VariableKind } from '@shared/template/types'
import { evaluateTemplate, evaluateVariables, templateVariableNames } from '@shared/variables'
import {
  bindVariable,
  createQuickVariable,
  objectExpression,
  setObjectExpression
} from './variableActions'

/** The sources offered in the picker, plus the state no picker entry describes. */
export type DataSource = 'fixed' | 'variable' | 'prompt' | 'counter' | 'field'
export type DataSourceState = DataSource | 'custom'

export interface DataSourceClassification {
  state: DataSourceState
  /** The bound variable when the expression is exactly one placeholder. */
  variable: LabelVariable | null
}

/** The variable kind a source creates or reuses; `null` where any kind fits. */
export function variableKindForSource(source: DataSource): VariableKind | null {
  return source === 'prompt' || source === 'counter' || source === 'field' ? source : null
}

/** The picker entry that presents a bound variable of this kind. */
function sourceForVariableKind(kind: VariableKind): DataSource {
  return kind === 'prompt' || kind === 'counter' || kind === 'field' ? kind : 'variable'
}

/**
 * Literal text is `fixed`, a lone placeholder for a known variable takes that
 * variable's source, and anything else — several placeholders, a placeholder
 * mixed with text, or an unknown name — is a hand-written `custom` expression
 * that the panel must not silently rewrite. The token grammar comes from the
 * evaluator, so the two cannot disagree about what a placeholder is.
 */
export function classifyDataSource(
  expression: string,
  variables: readonly LabelVariable[]
): DataSourceClassification {
  const names = templateVariableNames(expression)
  if (!names.length) return { state: 'fixed', variable: null }
  const only = names.length === 1 && expression === `{${names[0]}}` ? names[0] : null
  const variable = only ? (variables.find((candidate) => candidate.name === only) ?? null) : null
  return variable
    ? { state: sourceForVariableKind(variable.kind), variable }
    : { state: 'custom', variable: null }
}

/** The expression resolved against sample values, as shown in the preview line. */
export function dataSourcePreview(expression: string, variables: readonly LabelVariable[]): string {
  const sample = evaluateVariables(variables, { sample: true })
  return evaluateTemplate(expression, sample.values).value
}

function newVariableFor(kind: VariableKind, names: readonly string[]): LabelVariable {
  if (kind === 'counter') return createQuickVariable('serial', names)
  if (kind === 'field') return createQuickVariable('excel', names, 'Column')
  return createQuickVariable('operator', names)
}

/**
 * The variables a source can bind: those the picker presents under it. The
 * generic `variable` source deliberately excludes the kinds that have their
 * own entry, so picking it cannot answer with a counter and move the picker.
 */
export function variablesForSource(
  source: DataSource,
  variables: readonly LabelVariable[]
): LabelVariable[] {
  return variables.filter((candidate) => sourceForVariableKind(candidate.kind) === source)
}

/**
 * The variable a source binds when the operator has not named one: the bound
 * variable where it already fits, otherwise the first one that fits, otherwise
 * a new one. The generic `variable` source never creates one, so it answers
 * with `null` when the template has no variable it can present.
 */
function defaultVariableFor(
  source: DataSource,
  current: LabelVariable | null,
  variables: readonly LabelVariable[]
): LabelVariable | null {
  const candidates = variablesForSource(source, variables)
  if (current && candidates.includes(current)) return current
  const kind = variableKindForSource(source)
  return (
    candidates[0] ??
    (kind
      ? newVariableFor(
          kind,
          variables.map((candidate) => candidate.name)
        )
      : null)
  )
}

export interface DataSourceChoice {
  source: DataSource
  /** Bind this variable by name instead of reusing or creating one. */
  variableName?: string
}

/**
 * Points an object at a source. Choosing `fixed` unbinds it, keeping the value
 * the operator can currently see; every other source binds a single variable,
 * replacing the expression rather than appending to it.
 */
export function applyDataSource(
  document: LabelDocument,
  objectId: string,
  choice: DataSourceChoice
): LabelDocument {
  const object = document.template.design.objects.find((candidate) => candidate.id === objectId)
  const expression = object ? objectExpression(object) : null
  if (!object || object.locked || expression === null) return document
  const variables = document.template.variables

  let next = variables
  let bound = object
  if (choice.source === 'fixed') {
    bound = setObjectExpression(object, dataSourcePreview(expression, variables))
  } else {
    const target =
      (choice.variableName
        ? variables.find((candidate) => candidate.name === choice.variableName)
        : undefined) ??
      defaultVariableFor(
        choice.source,
        classifyDataSource(expression, variables).variable,
        variables
      )
    if (!target) return document
    if (!variables.includes(target)) next = [...variables, target]
    bound = bindVariable(object, target.name, 'replace')
  }
  return {
    ...document,
    template: {
      ...document.template,
      variables: [...next],
      design: {
        ...document.template.design,
        objects: document.template.design.objects.map((candidate) =>
          candidate.id === objectId ? bound : candidate
        )
      }
    }
  }
}
