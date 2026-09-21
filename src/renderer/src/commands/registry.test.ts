/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from './registry'
import { dispatchShortcut } from './shortcuts'
import { registerDocumentCommands } from './features/documentCommands'
import { registerWorkspaceCommands } from './features/workspaceCommands'
import { registerToolCommands } from './features/toolCommands'
import { CANVAS_MENU, LAYER_MENU, MENUS, TOOLS_MENU, type MenuEntry } from './menuModel'
import { useDocumentStore } from '../store/documentStore'
import { useEditorStore } from '../store/editorStore'
import { createObject } from '@shared/template/document'

function setup(enabled = true) {
  const registry = new CommandRegistry()
  const run = vi.fn()
  registry.register({
    id: 'edit.copy',
    label: 'Copy',
    isEnabled: () => enabled,
    run,
    shortcut: { display: 'Ctrl+C', binding: { key: 'c', ctrl: true } }
  })
  return { registry, run }
}

function key(overrides = {}): KeyboardEvent {
  return {
    key: 'c',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    preventDefault: vi.fn(),
    ...overrides
  } as unknown as KeyboardEvent
}

describe('command registry', () => {
  it('runs enabled commands and refuses disabled ones', async () => {
    const { registry, run } = setup()
    expect(await registry.execute('edit.copy')).toBe(true)
    expect(run).toHaveBeenCalledOnce()
    const disabled = setup(false)
    expect(await disabled.registry.execute('edit.copy')).toBe(false)
    expect(disabled.run).not.toHaveBeenCalled()
  })
  it('registers every command referenced by every menu with state logic', () => {
    const registry = new CommandRegistry()
    registerDocumentCommands(registry)
    registerWorkspaceCommands(registry)
    registerToolCommands(registry)
    const ids = (items: readonly MenuEntry[]): string[] =>
      items.flatMap((item) =>
        item === '-' ? [] : typeof item === 'string' ? [item] : ids(item.items)
      )
    const menuIds = [
      ...MENUS.flatMap((menu) => ids(menu.items)),
      ...ids(CANVAS_MENU),
      ...ids(LAYER_MENU),
      ...ids(TOOLS_MENU)
    ].filter((id) => id !== 'file.recentEmpty')
    expect(menuIds.every((id) => typeof registry.get(id).isEnabled() === 'boolean')).toBe(true)
    expect(registry.all().every((command) => command.run instanceof Function)).toBe(true)
  })
  it('disables document mutations for a forward-version read-only label', () => {
    useDocumentStore.getState().newDocument()
    const object = createObject('text', 0, 0)
    useDocumentStore.getState().addObjects([object])
    useDocumentStore.setState({ fileReadOnly: true })
    useEditorStore.getState().setSelectedIds([object.id])
    const registry = new CommandRegistry()
    registerDocumentCommands(registry)
    for (const id of [
      'file.save',
      'file.saveAs',
      'edit.cut',
      'edit.paste',
      'edit.delete',
      'object.lockAll'
    ]) {
      expect(registry.get(id).isEnabled(), id).toBe(false)
    }
    expect(registry.get('edit.copy').isEnabled()).toBe(true)
  })
  it('enables variable binding and selection conversion for compatible text', () => {
    useDocumentStore.getState().newDocument()
    const object = createObject('text', 0, 0)
    if (object.kind !== 'text') throw new Error('Expected text')
    object.text = 'Asset D530'
    useDocumentStore.getState().addObjects([object])
    useDocumentStore.getState().change((document) => ({
      ...document,
      template: {
        ...document.template,
        variables: [{ id: 'asset', name: 'asset', kind: 'fixed', value: 'D530' }]
      }
    }))
    useEditorStore.getState().setSelectedIds([object.id])
    useEditorStore.getState().setTextSelection({ objectId: object.id, start: 6, end: 10 })
    const registry = new CommandRegistry()
    registerDocumentCommands(registry)
    expect(registry.get('object.bindVariable').isEnabled()).toBe(true)
    expect(registry.get('object.makeVariableSelection').isEnabled()).toBe(true)
  })
  it('rejects unknown ids and duplicate ids or bindings', () => {
    const { registry } = setup()
    expect(() => registry.get('missing')).toThrow('Unknown')
    expect(() => registry.register(registry.get('edit.copy'))).toThrow('Duplicate command')
    expect(() => registry.register({ ...registry.get('edit.copy'), id: 'other' })).toThrow(
      'Duplicate shortcut'
    )
  })
})

describe('shortcut dispatcher', () => {
  it('dispatches once and matches modifiers exactly', () => {
    const { registry } = setup()
    const execute = vi.fn()
    const event = key()
    expect(dispatchShortcut(event, registry, execute)).toBe(true)
    expect(execute).toHaveBeenCalledExactlyOnceWith('edit.copy')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(dispatchShortcut(key({ shiftKey: true }), registry, execute)).toBe(false)
  })
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('leaves native editing in %s untouched', (tagName) => {
    const { registry } = setup()
    const event = key({ target: { tagName } })
    expect(dispatchShortcut(event, registry, vi.fn())).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
  it.each([
    { target: { isContentEditable: true } },
    { isComposing: true },
    { repeat: true },
    { defaultPrevented: true },
    { getModifierState: () => true }
  ])('ignores editing, composition, repeats and consumed keys', (overrides) => {
    expect(dispatchShortcut(key(overrides), setup().registry, vi.fn())).toBe(false)
  })
  it('blocks commands behind a modal and does not execute disabled commands', () => {
    const execute = vi.fn()
    expect(dispatchShortcut(key(), setup().registry, execute, true)).toBe(false)
    dispatchShortcut(key(), setup(false).registry, execute)
    expect(execute).not.toHaveBeenCalled()
  })
})
