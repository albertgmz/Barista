/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { defaultWorkspace, isWorkspaceLayout } from '@shared/workspace'
import type { WorkspaceLayout } from '@shared/workspace'
import { fail, ok } from '@shared/ipc/contract'
import type { IpcResult } from '@shared/ipc/contract'
import { userDataPaths } from './paths'

const MAX_BYTES = 256 * 1024
let writes: Promise<IpcResult<void>> = Promise.resolve(ok(undefined))

export async function readWorkspace(): Promise<IpcResult<WorkspaceLayout>> {
  try {
    const path = userDataPaths().workspaceFile
    if ((await stat(path)).size > MAX_BYTES) return ok(defaultWorkspace())
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    return ok(isWorkspaceLayout(value) ? value : defaultWorkspace())
  } catch (error) {
    if (error instanceof SyntaxError || (error as { code?: string }).code === 'ENOENT') {
      return ok(defaultWorkspace())
    }
    console.error('Workspace read failed', error)
    return fail('io-error', 'Could not load the workspace. The default layout will be used.')
  }
}

/** Serialize writes and atomically replace the last complete snapshot. */
export function writeWorkspace(value: unknown): Promise<IpcResult<void>> {
  if (!isWorkspaceLayout(value))
    return Promise.resolve(fail('invalid-input', 'Invalid workspace layout.'))
  const json = JSON.stringify(value, null, 2)
  if (Buffer.byteLength(json) > MAX_BYTES)
    return Promise.resolve(fail('invalid-input', 'Workspace is too large.'))
  writes = writes.then(async () => {
    try {
      const paths = userDataPaths()
      await mkdir(paths.root, { recursive: true })
      await writeFile(`${paths.workspaceFile}.tmp`, json, 'utf8')
      await rename(`${paths.workspaceFile}.tmp`, paths.workspaceFile)
      return ok(undefined)
    } catch (error) {
      console.error('Workspace write failed', error)
      return fail('io-error', 'Could not save the workspace.')
    }
  })
  return writes
}

export async function flushWorkspaceWrites(): Promise<void> {
  await writes
}
