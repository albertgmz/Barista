/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { runRepositoryContract } from './contractSuite'
import { PostgreSqlDataRepositories } from './postgresql'
import type { PostgreSqlConnectionConfig } from './types'

const testUrl = process.env['BARISTA_POSTGRESQL_TEST_URL']

function testConfig(): PostgreSqlConnectionConfig {
  if (!testUrl) throw new Error('BARISTA_POSTGRESQL_TEST_URL is not configured.')
  const url = new URL(testUrl)
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
    throw new Error('BARISTA_POSTGRESQL_TEST_URL must use postgresql://.')
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: url.pathname.replace(/^\//, ''),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    tls: url.searchParams.get('tls') === 'true'
  }
}

runRepositoryContract('PostgreSQL', () => PostgreSqlDataRepositories.connect(testConfig()), {
  skip: !testUrl
})
