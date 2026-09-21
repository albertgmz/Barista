/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { BarManifest } from './types'
import { BAR_FORMAT_VERSION } from './types'

interface MigratableArchive {
  manifest: BarManifest
  label: unknown
}

type Migration = (archive: MigratableArchive) => MigratableArchive

// Add future migrations here by source version, for example 2: migrateV2ToV3.
const MIGRATIONS: Readonly<Partial<Record<number, Migration>>> = {}

export function migrateBarArchive(archive: MigratableArchive): MigratableArchive {
  if (archive.manifest.formatVersion > BAR_FORMAT_VERSION) return archive
  let current = archive
  while (current.manifest.formatVersion < BAR_FORMAT_VERSION) {
    const migration = MIGRATIONS[current.manifest.formatVersion]
    if (!migration)
      throw new Error(
        `No migration is available from Barista label format version ${current.manifest.formatVersion}.`
      )
    current = migration(current)
  }
  return current
}
