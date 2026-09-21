/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it } from 'vitest'
import {
  PANEL_WIDTH_DEFAULT,
  clampPanelWidth,
  clampToolPosition,
  defaultWorkspace,
  isWorkspaceLayout,
  restoreWorkspace
} from './workspace'

describe('workspace format', () => {
  it('round trips defaults and floating layouts', () => {
    const value = defaultWorkspace()
    value.tools = { placement: 'floating', columns: 2, x: 400, y: 80, visible: true }
    expect(restoreWorkspace(JSON.parse(JSON.stringify(value)))).toEqual(value)
  })
  it.each([
    null,
    undefined,
    {},
    { version: 20 },
    { ...defaultWorkspace(), tools: {} },
    { ...defaultWorkspace(), tools: { ...defaultWorkspace().tools, x: Infinity } },
    { ...defaultWorkspace(), dockview: { grid: {}, panels: {} } },
    { ...defaultWorkspace(), optionsBarVisible: 'yes' },
    { ...defaultWorkspace(), panelWidth: 'wide' },
    { ...defaultWorkspace(), panelWidth: Number.NaN },
    { ...defaultWorkspace(), panelWidth: -1 },
    { ...defaultWorkspace(), keepObjectsInsideLabel: 'yes' },
    { ...defaultWorkspace(), showSampleData: 'yes' }
  ])('falls back for malformed data', (value) => {
    expect(restoreWorkspace(value)).toEqual(defaultWorkspace())
  })
  it('validates dockview references and rejects popouts', () => {
    const dockview = {
      grid: {
        width: 312,
        height: 500,
        orientation: 'HORIZONTAL',
        root: { type: 'branch', data: [{ type: 'leaf', data: { id: '1', views: ['properties'] } }] }
      },
      panels: { properties: { id: 'properties', contentComponent: 'properties' } }
    }
    expect(isWorkspaceLayout({ ...defaultWorkspace(), dockview })).toBe(true)
    expect(
      isWorkspaceLayout({ ...defaultWorkspace(), dockview: { ...dockview, panels: {} } })
    ).toBe(false)
    expect(
      isWorkspaceLayout({ ...defaultWorkspace(), dockview: { ...dockview, popoutGroups: [{}] } })
    ).toBe(false)
  })
  it('accepts layouts saved before the panel width existed', () => {
    const { panelWidth: _absent, ...legacy } = defaultWorkspace()
    expect(isWorkspaceLayout(legacy)).toBe(true)
    expect(restoreWorkspace(legacy)).toEqual(defaultWorkspace())
    expect(isWorkspaceLayout({ ...legacy, panelWidth: 420 })).toBe(true)
  })
  it('keeps the printable-area constraint across sessions', () => {
    expect(defaultWorkspace().keepObjectsInsideLabel).toBe(false)
    const enabled = { ...defaultWorkspace(), keepObjectsInsideLabel: true }
    expect(isWorkspaceLayout(enabled)).toBe(true)
    expect(restoreWorkspace(enabled).keepObjectsInsideLabel).toBe(true)
  })
  it('accepts layouts saved before the printable-area constraint existed', () => {
    const { keepObjectsInsideLabel: _absent, ...legacy } = defaultWorkspace()
    expect(isWorkspaceLayout(legacy)).toBe(true)
    expect(restoreWorkspace(legacy)).toEqual(defaultWorkspace())
  })
  it('keeps the sample-data view across sessions', () => {
    expect(defaultWorkspace().showSampleData).toBe(true)
    const off = { ...defaultWorkspace(), showSampleData: false }
    expect(isWorkspaceLayout(off)).toBe(true)
    expect(restoreWorkspace(off).showSampleData).toBe(false)
  })
  it('accepts layouts saved before the sample-data view existed', () => {
    const { showSampleData: _absent, ...legacy } = defaultWorkspace()
    expect(isWorkspaceLayout(legacy)).toBe(true)
    expect(restoreWorkspace(legacy)).toEqual(defaultWorkspace())
  })
  it('clamps the panel column width to its bounds and the available space', () => {
    expect(defaultWorkspace().panelWidth).toBe(PANEL_WIDTH_DEFAULT)
    expect(clampPanelWidth(420)).toBe(420)
    expect(clampPanelWidth(900)).toBe(720)
    expect(clampPanelWidth(100)).toBe(240)
    expect(clampPanelWidth(500, 800)).toBe(480)
    expect(clampPanelWidth(500, 300)).toBe(240)
    expect(clampPanelWidth(undefined)).toBe(PANEL_WIDTH_DEFAULT)
  })
  it('returns independent defaults and clamps positions after resizing', () => {
    const one = restoreWorkspace(null)
    one.panels.layers = false
    expect(defaultWorkspace().panels.layers).toBe(true)
    expect(clampToolPosition(800, 900, 500, 400, 80, 200)).toEqual({ x: 420, y: 200 })
    expect(clampToolPosition(-10, -20, 10, 10, 80, 200)).toEqual({ x: 0, y: 0 })
  })
})
