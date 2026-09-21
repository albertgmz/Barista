/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
/** Versioned workspace envelope. Dockview data stays opaque outside its host. */
export const PANEL_IDS = ['properties', 'layers', 'variables', 'assets', 'preflight'] as const
export type PanelId = (typeof PANEL_IDS)[number]
export type ToolPlacement = 'left' | 'right' | 'floating'
export interface WorkspaceLayout {
  version: 1
  dockview: Record<string, unknown> | null
  tools: { placement: ToolPlacement; x: number; y: number; columns: 1 | 2; visible: boolean }
  optionsBarVisible: boolean
  panels: Record<PanelId, boolean>
  panelWidth: number
  /** Whether the editor holds objects inside the printable area of the label. */
  keepObjectsInsideLabel: boolean
  /** Whether the canvas resolves `{variable}` tokens to their values. */
  showSampleData: boolean
}

/** Width of the panel column, in CSS pixels. */
export const PANEL_WIDTH_MIN = 240
export const PANEL_WIDTH_MAX = 720
export const PANEL_WIDTH_DEFAULT = 312

export function defaultWorkspace(): WorkspaceLayout {
  return {
    version: 1,
    dockview: null,
    tools: { placement: 'left', x: 80, y: 40, columns: 1, visible: true },
    optionsBarVisible: true,
    panels: { properties: true, layers: true, variables: true, assets: true, preflight: true },
    panelWidth: PANEL_WIDTH_DEFAULT,
    keepObjectsInsideLabel: false,
    showSampleData: true
  }
}

/**
 * Keep the column within its bounds and, when the host width is known, below 60% of it.
 * Layouts written before `panelWidth` existed have no width and fall back to the default.
 */
export function clampPanelWidth(width: number | undefined, available = 0): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) return PANEL_WIDTH_DEFAULT
  const ceiling = available > 0 ? Math.min(PANEL_WIDTH_MAX, available * 0.6) : PANEL_WIDTH_MAX
  return Math.round(Math.min(Math.max(PANEL_WIDTH_MIN, ceiling), Math.max(PANEL_WIDTH_MIN, width)))
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function coordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000
}

/** Reject foreign components, dangling views, duplicate groups and external popouts. */
function validDockview(value: unknown): value is Record<string, unknown> {
  if (!record(value) || !record(value.grid) || !record(value.panels)) return false
  const { grid, panels } = value
  if (
    !coordinate(grid.width) ||
    !coordinate(grid.height) ||
    !['HORIZONTAL', 'VERTICAL'].includes(String(grid.orientation))
  )
    return false
  if (
    ['floatingGroups', 'popoutGroups'].some(
      (key) => value[key] !== undefined && (!Array.isArray(value[key]) || value[key].length !== 0)
    )
  )
    return false
  if (value.edgeGroups !== undefined) return false
  const ids = Object.keys(panels)
  if (
    !ids.every(
      (id) =>
        PANEL_IDS.includes(id as PanelId) &&
        record(panels[id]) &&
        panels[id].id === id &&
        panels[id].contentComponent === id
    )
  )
    return false
  const seen = new Set<string>()
  const groups = new Set<string>()
  function node(item: unknown, depth: number): boolean {
    if (depth > 12 || !record(item) || (item.size !== undefined && !coordinate(item.size)))
      return false
    if (item.type === 'branch')
      return (
        Array.isArray(item.data) &&
        item.data.length <= 4 &&
        item.data.every((child) => node(child, depth + 1))
      )
    if (item.type !== 'leaf' || !record(item.data)) return false
    const group = item.data
    if (
      typeof group.id !== 'string' ||
      groups.has(group.id) ||
      !Array.isArray(group.views) ||
      group.views.length === 0 ||
      group.views.length > PANEL_IDS.length
    )
      return false
    groups.add(group.id)
    for (const id of group.views) {
      if (typeof id !== 'string' || !ids.includes(id) || seen.has(id)) return false
      seen.add(id)
    }
    return group.activeView === undefined || group.views.includes(group.activeView)
  }
  return (
    node(grid.root, 0) &&
    seen.size === ids.length &&
    (value.activeGroup === undefined || groups.has(String(value.activeGroup)))
  )
}

export function isWorkspaceLayout(value: unknown): value is WorkspaceLayout {
  if (!record(value) || value.version !== 1 || !record(value.tools) || !record(value.panels))
    return false
  const tools = value.tools
  return (
    (value.dockview === null || validDockview(value.dockview)) &&
    ['left', 'right', 'floating'].includes(String(tools.placement)) &&
    coordinate(tools.x) &&
    coordinate(tools.y) &&
    (tools.columns === 1 || tools.columns === 2) &&
    typeof tools.visible === 'boolean' &&
    typeof value.optionsBarVisible === 'boolean' &&
    (value.panelWidth === undefined || coordinate(value.panelWidth)) &&
    (value.keepObjectsInsideLabel === undefined ||
      typeof value.keepObjectsInsideLabel === 'boolean') &&
    (value.showSampleData === undefined || typeof value.showSampleData === 'boolean') &&
    PANEL_IDS.every(
      (id) =>
        typeof value.panels === 'object' &&
        typeof (value.panels as Record<string, unknown>)[id] === 'boolean'
    )
  )
}

export function restoreWorkspace(value: unknown): WorkspaceLayout {
  if (!isWorkspaceLayout(value)) return defaultWorkspace()
  return {
    ...value,
    panelWidth: clampPanelWidth(value.panelWidth),
    keepObjectsInsideLabel: value.keepObjectsInsideLabel ?? false,
    showSampleData: value.showSampleData ?? true
  }
}

export function clampToolPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  panelWidth: number,
  panelHeight: number
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, width - panelWidth)),
    y: Math.max(0, Math.min(y, height - panelHeight))
  }
}
