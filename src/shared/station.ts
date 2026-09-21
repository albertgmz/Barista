/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
export interface TemplateLibraryItem {
  id: string
  path: string
  title: string
  description: string
  tags: string[]
  status: 'draft' | 'approved'
  thumbnailDataUrl: string | null
  modifiedAt: string
  indexedAt: string
}

export interface TemplateLibraryStatus {
  folders: string[]
  entries: TemplateLibraryItem[]
  errors: string[]
  indexedAt: string | null
}

export interface StationSecurityStatus {
  hasAdminPin: boolean
}

export interface StationModeInfo {
  mode: 'editor' | 'station'
}

export interface StationHistoryAction {
  id: string
  jobId: string
  action: 'reprint' | 'void'
  reason: string
  date: string
}
