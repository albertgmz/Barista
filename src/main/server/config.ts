/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { dataRepositories } from '@main/data'
import type {
  IntegrationAuditEntry,
  IntegrationConfiguration,
  IntegrationScope,
  IntegrationTokenCreated,
  IntegrationTokenSummary
} from '@shared/integration'

const CONFIG_KEY = 'integration.configuration'
const TOKENS_KEY = 'integration.tokens'
const LOG_KEY = 'integration.audit'

const defaults: IntegrationConfiguration = {
  enabled: false,
  port: 17777,
  bindAddress: '127.0.0.1',
  allowLan: false,
  allowedOrigins: [],
  startWithWindows: false
}

const configSchema = z
  .object({
    enabled: z.boolean(),
    port: z.number().int().min(1024).max(65535),
    bindAddress: z.enum(['127.0.0.1', '0.0.0.0']),
    allowLan: z.boolean(),
    allowedOrigins: z.array(z.url().max(2048)).max(100),
    startWithWindows: z.boolean()
  })
  .superRefine((value, context) => {
    if (value.bindAddress === '0.0.0.0' && !value.allowLan)
      context.addIssue({
        code: 'custom',
        path: ['allowLan'],
        message: 'LAN binding requires explicit acknowledgement.'
      })
  })

interface StoredToken extends IntegrationTokenSummary {
  hash: string
}

export async function readIntegrationConfiguration(): Promise<IntegrationConfiguration> {
  const value = await dataRepositories().settings.read<unknown>(CONFIG_KEY)
  return value === null ? { ...defaults } : configSchema.parse(value)
}

export async function writeIntegrationConfiguration(
  value: IntegrationConfiguration
): Promise<IntegrationConfiguration> {
  const parsed = configSchema.parse(value)
  await dataRepositories().settings.write(CONFIG_KEY, parsed)
  return parsed
}

async function tokens(): Promise<StoredToken[]> {
  return (await dataRepositories().settings.read<StoredToken[]>(TOKENS_KEY)) ?? []
}

export async function listIntegrationTokens(): Promise<IntegrationTokenSummary[]> {
  return (await tokens()).map(({ hash: _hash, ...summary }) => summary)
}

export async function createIntegrationToken(
  name: string,
  scopes: IntegrationScope[]
): Promise<IntegrationTokenCreated> {
  const checked = z
    .object({
      name: z.string().trim().min(1).max(100),
      scopes: z
        .array(z.enum(['read', 'preview', 'print']))
        .min(1)
        .max(3)
    })
    .parse({ name, scopes })
  const secret = `bar_${randomBytes(32).toString('base64url')}`
  const summary: IntegrationTokenSummary = {
    id: randomBytes(12).toString('hex'),
    name: checked.name,
    scopes: [...new Set(checked.scopes)],
    createdAt: new Date().toISOString(),
    lastUsedAt: null
  }
  await dataRepositories().settings.write(TOKENS_KEY, [
    ...(await tokens()),
    { ...summary, hash: createHash('sha256').update(secret).digest('hex') }
  ])
  return { token: secret, summary }
}

export async function revokeIntegrationToken(id: string): Promise<void> {
  await dataRepositories().settings.write(
    TOKENS_KEY,
    (await tokens()).filter((token) => token.id !== id)
  )
}

export async function authenticateIntegrationToken(
  secret: string,
  scope: IntegrationScope
): Promise<IntegrationTokenSummary | null> {
  const digest = Buffer.from(createHash('sha256').update(secret).digest('hex'))
  const all = await tokens()
  const found = all.find((token) => {
    const expected = Buffer.from(token.hash)
    return expected.length === digest.length && timingSafeEqual(expected, digest)
  })
  if (!found || !found.scopes.includes(scope)) return null
  found.lastUsedAt = new Date().toISOString()
  await dataRepositories().settings.write(TOKENS_KEY, all)
  const { hash: _hash, ...summary } = found
  return summary
}

export async function appendIntegrationAudit(
  entry: Omit<IntegrationAuditEntry, 'id' | 'date'>
): Promise<void> {
  const all = (await dataRepositories().settings.read<IntegrationAuditEntry[]>(LOG_KEY)) ?? []
  await dataRepositories().settings.write(
    LOG_KEY,
    [
      { ...entry, id: randomBytes(12).toString('hex'), date: new Date().toISOString() },
      ...all
    ].slice(0, 2000)
  )
}

export async function integrationAudit(): Promise<IntegrationAuditEntry[]> {
  return ((await dataRepositories().settings.read<IntegrationAuditEntry[]>(LOG_KEY)) ?? []).slice(
    0,
    200
  )
}
