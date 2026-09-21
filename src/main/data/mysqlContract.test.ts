/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { runRepositoryContract } from './contractSuite'
import { MySqlDataRepositories } from './mysql'
import type { MySqlConnectionConfig } from './types'

const testUrl = process.env.BARISTA_MYSQL_TEST_URL

function testConfig(): MySqlConnectionConfig {
  if (!testUrl) throw new Error('BARISTA_MYSQL_TEST_URL is not configured.')
  const url = new URL(testUrl)
  if (url.protocol !== 'mysql:') throw new Error('BARISTA_MYSQL_TEST_URL must use mysql://.')
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    database: url.pathname.replace(/^\//, ''),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    tls: url.searchParams.get('tls') === 'true'
  }
}

runRepositoryContract('MySQL', () => MySqlDataRepositories.connect(testConfig()), {
  skip: !testUrl
})
