/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { readFile, writeFile, rename, mkdir, copyFile, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { RecentFile } from '@shared/ipc/contract'
import type { LabelDocument } from '@shared/template/types'
import type { OpenedLabel, RecoveryRecord } from '@shared/format/types'
import { stableJson } from '@shared/format/stableJson'
import { diagnosticLog } from '@main/diagnostics'
import { userDataPaths } from './paths'
import { decodeArchiveResult, encodeArchive, readArchivePreview } from './archive'

/**
 * A 1x1 opaque white PNG: 8-bit greyscale, one scanline of `00 ff`.
 *
 * The archive format requires a preview, and losing a document because its
 * cosmetic thumbnail failed would be far worse than storing a blank one.
 */
const BLANK_PREVIEW = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mP4DwABAQEAHLCMmQAAAABJRU5ErkJggg==',
  'base64'
)

/** The thumbnail already stored at `path`, so a failed render does not discard a good one. */
async function storedPreview(path: string): Promise<Uint8Array | null> {
  try {
    return readArchivePreview(await readFile(path))
  } catch {
    return null
  }
}

interface TemplateStoreOptions {
  root?: string
  appVersion?: string
  renderPreview?: (document: LabelDocument) => Promise<Uint8Array>
}

export class TemplateStore {
  private recentTail: Promise<void> = Promise.resolve()
  constructor(private readonly options: TemplateStoreOptions = {}) {}
  private root(): string {
    return this.options.root ?? userDataPaths().root
  }
  private appVersion(): string {
    return this.options.appVersion ?? process.env['npm_package_version'] ?? '0.0.0'
  }
  /** `previousPath` is the file being replaced, whose thumbnail outlives a failed render. */
  private async preview(document: LabelDocument, previousPath: string): Promise<Uint8Array> {
    if (!this.options.renderPreview) throw new Error('No label preview renderer is configured.')
    try {
      return await this.options.renderPreview(document)
    } catch (error) {
      // Unrenderable content, such as a barcode whose data no encoder accepts,
      // must never stand between the user and a saved file.
      diagnosticLog.warn('template.preview-failed', { error })
      return (await storedPreview(previousPath)) ?? BLANK_PREVIEW
    }
  }
  async read(path: string): Promise<OpenedLabel> {
    const document = decodeArchiveResult(await readFile(path))
    await this.remember(path)
    return document
  }
  async write(path: string, document: LabelDocument): Promise<void> {
    if (!path.toLowerCase().endsWith('.bar'))
      throw new Error('Barista labels must be saved with the .bar extension.')
    const bytes = encodeArchive(document, {
      appVersion: this.appVersion(),
      previewPng: await this.preview(document, path)
    })
    try {
      await copyFile(path, `${path}.bak`)
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error
    }
    await atomicWrite(path, bytes)
    await this.remember(path)
  }
  async writeRecovery(document: LabelDocument, originalPath: string | null): Promise<void> {
    const recoveryDir = join(this.root(), 'recovery')
    await mkdir(recoveryDir, { recursive: true })
    const autosavePath = join(recoveryDir, 'autosave.bar')
    await atomicWrite(
      autosavePath,
      encodeArchive(document, {
        appVersion: this.appVersion(),
        previewPng: await this.preview(document, autosavePath)
      })
    )
    await atomicWrite(
      join(recoveryDir, 'autosave.json'),
      Buffer.from(stableJson({ originalPath, savedAt: new Date().toISOString() }))
    )
  }
  async readRecovery(): Promise<RecoveryRecord | null> {
    try {
      const recoveryDir = join(this.root(), 'recovery')
      const [archive, rawMetadata] = await Promise.all([
        readFile(join(recoveryDir, 'autosave.bar')),
        readFile(join(recoveryDir, 'autosave.json'), 'utf8')
      ])
      const metadata: unknown = JSON.parse(rawMetadata)
      if (
        !metadata ||
        typeof metadata !== 'object' ||
        !('savedAt' in metadata) ||
        typeof metadata.savedAt !== 'string' ||
        !('originalPath' in metadata) ||
        (metadata.originalPath !== null && typeof metadata.originalPath !== 'string')
      )
        throw new Error('Recovery metadata is invalid.')
      return {
        document: decodeArchiveResult(archive).document,
        originalPath: metadata.originalPath,
        savedAt: metadata.savedAt
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null
      throw error
    }
  }
  async discardRecovery(): Promise<void> {
    const recoveryDir = join(this.root(), 'recovery')
    await Promise.all(
      ['autosave.bar', 'autosave.json'].map(async (name) => {
        try {
          await unlink(join(recoveryDir, name))
        } catch (error) {
          if ((error as { code?: string }).code !== 'ENOENT') throw error
        }
      })
    )
  }
  async listRecent(): Promise<RecentFile[]> {
    try {
      const data: unknown = JSON.parse(await readFile(join(this.root(), 'recent.json'), 'utf8'))
      if (!Array.isArray(data)) return []
      return data
        .filter(
          (v): v is RecentFile =>
            !!v &&
            typeof v.path === 'string' &&
            typeof v.name === 'string' &&
            typeof v.openedAt === 'string'
        )
        .slice(0, 10)
    } catch {
      return []
    }
  }
  async clearRecent(): Promise<void> {
    const path = join(this.root(), 'recent.json')
    try {
      await unlink(path)
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error
    }
  }
  private async remember(path: string): Promise<void> {
    const save = async (): Promise<void> => {
      const list = await this.listRecent(),
        root = this.root()
      await mkdir(root, { recursive: true })
      await writeFile(
        join(root, 'recent.json.tmp'),
        JSON.stringify(
          [
            { path, name: basename(path), openedAt: new Date().toISOString() },
            ...list.filter((f) => f.path !== path)
          ].slice(0, 10)
        )
      )
      await rename(join(root, 'recent.json.tmp'), join(root, 'recent.json'))
    }
    this.recentTail = this.recentTail.then(save, save)
    await this.recentTail
  }
}

async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temp, bytes)
    await rename(temp, path)
  } catch (error) {
    try {
      await unlink(temp)
    } catch {
      // The rename may have consumed the temporary file.
    }
    throw error
  }
}
