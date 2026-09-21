/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  dataConfigurationInputSchema,
  DEFAULT_DATA_CONFIGURATION,
  type DataConfiguration,
  type DataConfigurationInput
} from '@shared/dataSettings'
import { stableJson } from '@shared/format/stableJson'

export interface SecretProtector {
  isAvailable(): Promise<boolean>
  encrypt(value: string): Promise<Uint8Array>
  decrypt(value: Uint8Array): Promise<string>
}

type RemoteEngine = 'mysql' | 'mariadb' | 'postgresql'
export type ResolvedDataConfiguration =
  | { engine: 'sqlite' }
  | {
      engine: RemoteEngine
      host: string
      port: number
      database: string
      user: string
      password: string
      tls: boolean
    }

const diskConnectionSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().trim().min(1).max(128),
  user: z.string().trim().min(1).max(128),
  tls: z.boolean(),
  encryptedPassword: z.string().max(16_384).optional()
})
const diskSchema = z.object({
  version: z.literal(2),
  engine: z.enum(['sqlite', 'mysql', 'mariadb', 'postgresql']),
  mysql: diskConnectionSchema,
  mariadb: diskConnectionSchema,
  postgresql: diskConnectionSchema
})
const legacyDiskSchema = z.object({
  version: z.literal(1),
  engine: z.enum(['sqlite', 'mysql']),
  mysql: diskConnectionSchema
})
type DiskConfiguration = z.infer<typeof diskSchema>

function defaultConnection(engine: RemoteEngine): z.infer<typeof diskConnectionSchema> {
  const value = DEFAULT_DATA_CONFIGURATION[engine]
  return {
    host: value.host,
    port: value.port,
    database: value.database,
    user: value.user,
    tls: value.tls
  }
}

function defaultDisk(): DiskConfiguration {
  return {
    version: 2,
    engine: DEFAULT_DATA_CONFIGURATION.engine,
    mysql: defaultConnection('mysql'),
    mariadb: defaultConnection('mariadb'),
    postgresql: defaultConnection('postgresql')
  }
}

function publicConfiguration(value: DiskConfiguration): DataConfiguration {
  const publicConnection = (engine: RemoteEngine) => ({
    host: value[engine].host,
    port: value[engine].port,
    database: value[engine].database,
    user: value[engine].user,
    tls: value[engine].tls,
    passwordSaved: Boolean(value[engine].encryptedPassword)
  })
  return {
    engine: value.engine,
    mysql: publicConnection('mysql'),
    mariadb: publicConnection('mariadb'),
    postgresql: publicConnection('postgresql')
  }
}

export class DataConfigurationStore {
  constructor(
    private readonly path: string,
    private readonly protector: SecretProtector
  ) {}

  private async readDisk(): Promise<DiskConfiguration> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      const current = diskSchema.safeParse(raw)
      if (current.success) return current.data
      const legacy = legacyDiskSchema.safeParse(raw)
      return legacy.success
        ? { ...defaultDisk(), engine: legacy.data.engine, mysql: legacy.data.mysql }
        : defaultDisk()
    } catch {
      return defaultDisk()
    }
  }

  async readPublic(): Promise<DataConfiguration> {
    return publicConfiguration(await this.readDisk())
  }

  async readResolved(): Promise<ResolvedDataConfiguration> {
    const value = await this.readDisk()
    return value.engine === 'sqlite'
      ? { engine: 'sqlite' }
      : this.resolveConnection(value.engine, value[value.engine])
  }

  async resolveInput(input: DataConfigurationInput): Promise<ResolvedDataConfiguration> {
    const checked = dataConfigurationInputSchema.parse(input)
    if (checked.engine === 'sqlite') return { engine: 'sqlite' }
    const current = await this.readDisk()
    const supplied = checked[checked.engine]
    const encrypted = current[checked.engine].encryptedPassword
    const password =
      supplied.password !== undefined && supplied.password !== ''
        ? supplied.password
        : encrypted
          ? await this.protector.decrypt(Buffer.from(encrypted, 'base64'))
          : ''
    return { engine: checked.engine, ...supplied, password }
  }

  async write(input: DataConfigurationInput): Promise<DataConfiguration> {
    const checked = dataConfigurationInputSchema.parse(input)
    const current = await this.readDisk()
    const next = defaultDisk()
    next.engine = checked.engine
    for (const engine of ['mysql', 'mariadb', 'postgresql'] as const) {
      const supplied = checked[engine]
      let encryptedPassword = current[engine].encryptedPassword
      if (supplied.password !== undefined && supplied.password !== '') {
        if (!(await this.protector.isAvailable()))
          throw new Error('Secure credential storage is unavailable on this computer.')
        encryptedPassword = Buffer.from(await this.protector.encrypt(supplied.password)).toString(
          'base64'
        )
      }
      next[engine] = {
        host: supplied.host,
        port: supplied.port,
        database: supplied.database,
        user: supplied.user,
        tls: supplied.tls,
        ...(encryptedPassword ? { encryptedPassword } : {})
      }
    }
    const validated = diskSchema.parse(next)
    await mkdir(dirname(this.path), { recursive: true })
    const temp = `${this.path}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temp, stableJson(validated), 'utf8')
      await rename(temp, this.path)
    } catch (error) {
      try {
        await unlink(temp)
      } catch {
        // Rename may already have consumed the temporary file.
      }
      throw error
    }
    return publicConfiguration(validated)
  }

  private async resolveConnection(
    engine: RemoteEngine,
    value: z.infer<typeof diskConnectionSchema>
  ): Promise<ResolvedDataConfiguration> {
    const password = value.encryptedPassword
      ? await this.protector.decrypt(Buffer.from(value.encryptedPassword, 'base64'))
      : ''
    return {
      engine,
      host: value.host,
      port: value.port,
      database: value.database,
      user: value.user,
      password,
      tls: value.tls
    }
  }
}
