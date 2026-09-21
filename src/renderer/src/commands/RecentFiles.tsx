/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { MenuDivider, MenuItem } from '@fluentui/react-components'
import type { RecentFile } from '@shared/ipc/contract'
import { openDocument } from '../editor/fileActions'
import { useCommands } from './context'
export function RecentFiles(): JSX.Element {
  const [files, setFiles] = useState<RecentFile[]>([])
  const { execute } = useCommands()
  useEffect(() => {
    void window.barista.invoke('template:listRecent').then((r) => {
      if (r.ok) setFiles(r.value)
    })
  }, [])
  return (
    <>
      {files.length ? (
        files.map((f) => (
          <MenuItem
            key={f.path}
            title={f.path}
            onClick={() => {
              void openDocument(f.path).catch((e) =>
                window.alert(e instanceof Error ? e.message : String(e))
              )
            }}
          >
            {f.name}
          </MenuItem>
        ))
      ) : (
        <MenuItem disabled>No recent files</MenuItem>
      )}
      {files.length > 0 && <MenuDivider />}
      <MenuItem
        disabled={files.length === 0}
        onClick={() => {
          execute('file.clearRecent')
          setFiles([])
        }}
      >
        Clear Recent
      </MenuItem>
    </>
  )
}
