/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { RecentFiles } from './RecentFiles'
import type { JSX } from 'react'
import type { MenuProps } from '@fluentui/react-components'
import {
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  MenuItemCheckbox
} from '@fluentui/react-components'
import { useCommands } from './context'
import type { MenuEntry } from './menuModel'
import { useDocumentStore, useEditorStore, useUiStore } from '../store'
import { useWorkspaceStore } from '../store/workspaceStore'

export function CommandMenuList({ items }: { items: readonly MenuEntry[] }): JSX.Element {
  const { registry, execute } = useCommands()
  useEditorStore((state) => state.selectedIds)
  useEditorStore((state) => state.activeTool)
  useDocumentStore()
  useUiStore()
  useWorkspaceStore((state) => state.layout)
  return (
    <MenuList>
      {items.map((entry, index) => {
        if (entry === 'file.recentEmpty') return <RecentFiles key={entry} />
        if (entry === '-') return <MenuDivider key={index} />
        if (typeof entry !== 'string')
          return (
            <RegistryMenu key={entry.label} openOnHover>
              <MenuTrigger disableButtonEnhancement>
                <MenuItem>{entry.label}</MenuItem>
              </MenuTrigger>
              <MenuPopover>
                <CommandMenuList items={entry.items} />
              </MenuPopover>
            </RegistryMenu>
          )
        const command = registry.get(entry)
        const props = {
          disabled: !command.isEnabled(),
          icon: command.icon,
          secondaryContent: command.shortcut?.display,
          onClick: () => execute(command.id)
        }
        return command.isChecked ? (
          <MenuItemCheckbox
            persistOnClick={false}
            key={entry}
            name="commands"
            value={entry}
            {...props}
          >
            {command.label}
          </MenuItemCheckbox>
        ) : (
          <MenuItem key={entry} {...props}>
            {command.label}
          </MenuItem>
        )
      })}
    </MenuList>
  )
}

export function RegistryMenu(props: MenuProps): JSX.Element {
  const { registry } = useCommands()
  useDocumentStore()
  useUiStore()
  useWorkspaceStore((state) => state.layout)
  useEditorStore((state) => state.activeTool)
  const checked = registry
    .all()
    .filter((command) => command.isChecked?.())
    .map((command) => command.id)
  return <Menu {...props} checkedValues={{ commands: checked }} />
}
