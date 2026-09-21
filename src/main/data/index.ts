/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { safeStorage } from 'electron'
import { DataConfigurationStore, type SecretProtector } from './config'
import { DataStoreManager } from './manager'
import type { DataRepositories } from './types'
import { userDataPaths } from '../storage/paths'

const electronSecretProtector: SecretProtector = {
  isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encrypt: (value) => safeStorage.encryptStringAsync(value),
  decrypt: async (value) => (await safeStorage.decryptStringAsync(Buffer.from(value))).result
}

let manager: DataStoreManager | null = null

export async function initializeDataStore(): Promise<void> {
  const paths = userDataPaths()
  manager = new DataStoreManager(
    new DataConfigurationStore(paths.dataConfigurationFile, electronSecretProtector),
    paths.countersDb
  )
  await manager.initialize()
}

export function dataStoreManager(): DataStoreManager {
  if (!manager) throw new Error('The data store has not been initialized.')
  return manager
}

export function dataRepositories(): DataRepositories {
  return dataStoreManager().repositories()
}

export async function closeDataStore(): Promise<void> {
  const current = manager
  manager = null
  if (current) await current.close()
}
