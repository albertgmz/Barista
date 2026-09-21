/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { JSX } from 'react'
import { useDocumentStore, useEditorStore } from '../store'
import { MenuPopover, MenuTrigger } from '@fluentui/react-components'
import { CommandMenuList, RegistryMenu } from '../commands/CommandMenu'
import { LAYER_MENU } from '../commands/menuModel'
export function LayersPanel(): JSX.Element {
  const document = useDocumentStore((s) => s.document),
    ids = useEditorStore((s) => s.selectedIds)
  return (
    <div className="layers-list" role="list" aria-label="Layers">
      {[...document.template.design.objects].reverse().map((o) => (
        <RegistryMenu key={o.id} openOnContext>
          <MenuTrigger disableButtonEnhancement>
            <div
              key={o.id}
              role="listitem"
              className={ids.includes(o.id) ? 'layer selected' : 'layer'}
              draggable
              onContextMenu={() => {
                if (!ids.includes(o.id)) useEditorStore.getState().setSelectedIds([o.id])
              }}
              onDragStart={(e) => e.dataTransfer.setData('text/plain', o.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const source = e.dataTransfer.getData('text/plain')
                useDocumentStore.getState().change((d) => {
                  const objects = [...d.template.design.objects],
                    from = objects.findIndex((x) => x.id === source),
                    to = objects.findIndex((x) => x.id === o.id)
                  if (from < 0 || from === to) return d
                  objects.splice(to, 0, objects.splice(from, 1)[0]!)
                  return {
                    ...d,
                    template: { ...d.template, design: { ...d.template.design, objects } }
                  }
                })
              }}
            >
              <button
                aria-label={`Select ${o.name}`}
                aria-pressed={ids.includes(o.id)}
                onClick={(e) =>
                  useEditorStore
                    .getState()
                    .setSelectedIds(e.shiftKey ? [...new Set([...ids, o.id])] : [o.id])
                }
              >
                {o.kind}
              </button>
              <input
                aria-label={`Rename ${o.name}`}
                value={o.name}
                onFocus={() => useDocumentStore.getState().beginGesture()}
                onBlur={() => useDocumentStore.getState().endGesture()}
                onChange={(e) =>
                  useDocumentStore.getState().updateObjects([o.id], { name: e.target.value }, true)
                }
              />
              <button
                title={o.locked ? 'Unlock' : 'Lock'}
                aria-label={`${o.locked ? 'Unlock' : 'Lock'} ${o.name}`}
                onClick={() =>
                  useDocumentStore.getState().updateObjects([o.id], { locked: !o.locked }, true)
                }
              >
                {o.locked ? '🔒' : '○'}
              </button>
              <button
                title={o.visible ? 'Hide' : 'Show'}
                aria-label={`${o.visible ? 'Hide' : 'Show'} ${o.name}`}
                onClick={() =>
                  useDocumentStore.getState().updateObjects([o.id], { visible: !o.visible }, true)
                }
              >
                {o.visible ? '●' : '○'}
              </button>
            </div>
          </MenuTrigger>
          <MenuPopover>
            <CommandMenuList items={LAYER_MENU} />
          </MenuPopover>
        </RegistryMenu>
      ))}
      {!document.template.design.objects.length && (
        <p>No objects yet. Choose a tool and draw on the label.</p>
      )}
    </div>
  )
}
