/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const env = {
  ...process.env,
  BARISTA_MYSQL_TEST_URL:
    process.env.BARISTA_MYSQL_TEST_URL ??
    'mysql://barista:barista-test-only@127.0.0.1:33306/barista_test',
  BARISTA_MARIADB_TEST_URL:
    process.env.BARISTA_MARIADB_TEST_URL ??
    'mysql://barista:barista-test-only@127.0.0.1:33307/barista_test',
  BARISTA_POSTGRESQL_TEST_URL:
    process.env.BARISTA_POSTGRESQL_TEST_URL ??
    'postgresql://barista:barista-test-only@127.0.0.1:35432/barista_test'
}
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
    'run',
    'src/main/data/mysqlContract.test.ts',
    'src/main/data/mariadbContract.test.ts',
    'src/main/data/postgresqlContract.test.ts'
  ],
  { env, stdio: 'inherit' }
)
process.exit(result.status ?? 1)
