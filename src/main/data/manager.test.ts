/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DataConfigurationStore, type SecretProtector } from './config'
import { DataStoreManager } from './manager'
import { SqliteDataRepositories } from './sqlite'
import { DEFAULT_DATA_CONFIGURATION } from '@shared/dataSettings'

const roots: string[] = []
const protector: SecretProtector = {
  isAvailable: async () => true,
  encrypt: async (value) => Buffer.from(value),
  decrypt: async (value) => Buffer.from(value).toString('utf8')
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('DataStoreManager', () => {
  it('does not fall back to SQLite when the selected MySQL store is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'barista-manager-'))
    roots.push(root)
    const config = new DataConfigurationStore(join(root, 'data.json'), protector)
    const manager = new DataStoreManager(config, join(root, 'local.db'), {
      sqlite: (path) => new SqliteDataRepositories(path),
      mysql: async () => {
        throw new Error('Remote database refused the connection.')
      },
      mariadb: async () => {
        throw new Error('unused')
      },
      postgresql: async () => {
        throw new Error('unused')
      }
    })
    await manager.initialize()
    expect(manager.repositories()).toBeDefined()

    await expect(
      manager.saveConfiguration({
        mariadb: (({ passwordSaved: _, ...value }) => value)(DEFAULT_DATA_CONFIGURATION.mariadb),
        postgresql: (({ passwordSaved: _, ...value }) => value)(
          DEFAULT_DATA_CONFIGURATION.postgresql
        ),
        engine: 'mysql',
        mysql: {
          host: 'unavailable.example.test',
          port: 3306,
          database: 'barista',
          user: 'station',
          password: 'secret',
          tls: true
        }
      })
    ).rejects.toThrow('refused')
    expect(() => manager.repositories()).toThrow('Remote database refused')
    await expect(manager.runtimeStatus()).resolves.toMatchObject({
      connection: 'unavailable',
      migration: { engine: 'mysql', integrity: 'unavailable' }
    })
    await manager.close()
  })
})
