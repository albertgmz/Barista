/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DataConfigurationStore, type SecretProtector } from './config'
import { DEFAULT_DATA_CONFIGURATION } from '@shared/dataSettings'

const roots: string[] = []
const protector: SecretProtector = {
  isAvailable: async () => true,
  encrypt: async (value) => Buffer.from(`protected:${value}`),
  decrypt: async (value) =>
    Buffer.from(value)
      .toString('utf8')
      .replace(/^protected:/, '')
}

async function setup(): Promise<{ root: string; store: DataConfigurationStore }> {
  const root = await mkdtemp(join(tmpdir(), 'barista-data-config-'))
  roots.push(root)
  return { root, store: new DataConfigurationStore(join(root, 'data.json'), protector) }
}

const connectionInput = (engine: 'mariadb' | 'postgresql') => {
  const { passwordSaved: _passwordSaved, ...connection } = DEFAULT_DATA_CONFIGURATION[engine]
  return connection
}
const otherConnections = {
  mariadb: connectionInput('mariadb'),
  postgresql: connectionInput('postgresql')
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('DataConfigurationStore', () => {
  it('uses local SQLite defaults when the bootstrap file is absent or corrupt', async () => {
    const { root, store } = await setup()
    await expect(store.readPublic()).resolves.toMatchObject({ engine: 'sqlite' })
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(join(root, 'data.json'), '{')
    )
    await expect(store.readPublic()).resolves.toMatchObject({ engine: 'sqlite' })
  })

  it('encrypts the password and never returns it in public settings', async () => {
    const { root, store } = await setup()
    const publicSettings = await store.write({
      ...otherConnections,
      engine: 'mysql',
      mysql: {
        host: 'db.example.test',
        port: 3306,
        database: 'labels',
        user: 'station',
        tls: true,
        password: 'correct horse battery staple'
      }
    })
    expect(publicSettings.mysql.passwordSaved).toBe(true)
    expect(JSON.stringify(publicSettings)).not.toContain('correct horse')
    const disk = await readFile(join(root, 'data.json'), 'utf8')
    expect(disk).not.toContain('correct horse')
    await expect(store.readResolved()).resolves.toMatchObject({
      engine: 'mysql',
      password: 'correct horse battery staple'
    })
  })

  it('retains a saved password when an edit omits it', async () => {
    const { store } = await setup()
    await store.write({
      ...otherConnections,
      engine: 'mysql',
      mysql: {
        host: 'db.example.test',
        port: 3306,
        database: 'labels',
        user: 'station',
        tls: true,
        password: 'secret'
      }
    })
    await store.write({
      ...otherConnections,
      engine: 'mysql',
      mysql: {
        host: 'db2.example.test',
        port: 3307,
        database: 'labels',
        user: 'station',
        tls: true
      }
    })
    await expect(store.readResolved()).resolves.toMatchObject({
      host: 'db2.example.test',
      port: 3307,
      password: 'secret'
    })
  })

  it('encrypts MariaDB and PostgreSQL passwords independently', async () => {
    const { root, store } = await setup()
    const mysql = (({ passwordSaved: _passwordSaved, ...value }) => value)(
      DEFAULT_DATA_CONFIGURATION.mysql
    )
    await store.write({
      engine: 'postgresql',
      mysql,
      mariadb: { ...otherConnections.mariadb, password: 'maria-secret' },
      postgresql: { ...otherConnections.postgresql, password: 'postgres-secret' }
    })
    const disk = await readFile(join(root, 'data.json'), 'utf8')
    expect(disk).not.toContain('maria-secret')
    expect(disk).not.toContain('postgres-secret')
    await expect(store.readResolved()).resolves.toMatchObject({
      engine: 'postgresql',
      password: 'postgres-secret'
    })
    await expect(
      store.resolveInput({
        engine: 'mariadb',
        mysql,
        mariadb: otherConnections.mariadb,
        postgresql: otherConnections.postgresql
      })
    ).resolves.toMatchObject({ engine: 'mariadb', password: 'maria-secret' })
  })
})
