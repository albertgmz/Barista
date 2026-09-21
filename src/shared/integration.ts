/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
export type IntegrationScope = 'read' | 'preview' | 'print'

export interface IntegrationConfiguration {
  enabled: boolean
  port: number
  bindAddress: '127.0.0.1' | '0.0.0.0'
  allowLan: boolean
  allowedOrigins: string[]
  startWithWindows: boolean
}

export interface IntegrationTokenSummary {
  id: string
  name: string
  scopes: IntegrationScope[]
  createdAt: string
  lastUsedAt: string | null
}

export interface IntegrationStatus {
  configuration: IntegrationConfiguration
  running: boolean
  actualPort: number | null
  tokens: IntegrationTokenSummary[]
  recentLogs: IntegrationAuditEntry[]
}

export interface IntegrationAuditEntry {
  id: string
  date: string
  client: string
  tokenName: string | null
  endpoint: string
  result: string
}

export interface IntegrationTokenCreated {
  token: string
  summary: IntegrationTokenSummary
}
