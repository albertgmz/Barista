/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { readWorkspace, writeWorkspace } from '../storage/workspace'
import { handle } from './typedIpc'

export function registerWorkspaceIpc(): void {
  handle('workspace:read', readWorkspace)
  handle('workspace:write', writeWorkspace)
}
