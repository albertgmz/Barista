/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { dataRepositories } from '@main/data'
import { decodeArchiveResult, readArchivePreview } from '@main/storage/archive'
import { userDataPaths } from '@main/storage/paths'
import type { TemplateLibraryItem, TemplateLibraryStatus } from '@shared/station'
import type { TemplateLibraryEntry } from '@main/data/types'

export const LIBRARY_FOLDERS_KEY = 'station.libraryFolders'
const MAX_FILES = 10_000
const MAX_DEPTH = 12

function libraryId(path: string): string {
  return createHash('sha256').update(path.toLocaleLowerCase()).digest('hex').slice(0, 32)
}

async function findTemplates(folder: string): Promise<string[]> {
  const files: string[] = []
  async function visit(current: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (files.length >= MAX_FILES) return
      const path = join(current, entry.name)
      if (entry.isDirectory()) await visit(path, depth + 1)
      else if (entry.isFile() && extname(entry.name).toLocaleLowerCase() === '.bar')
        files.push(path)
    }
  }
  await visit(folder, 0)
  return files
}

export async function libraryFolders(): Promise<string[]> {
  const value = await dataRepositories().settings.read<unknown>(LIBRARY_FOLDERS_KEY)
  if (!Array.isArray(value)) return []
  return value.filter(
    (folder): folder is string => typeof folder === 'string' && isAbsolute(folder)
  )
}

export async function setLibraryFolders(folders: readonly string[]): Promise<string[]> {
  const clean = [
    ...new Set(
      folders
        .map((folder) => normalize(resolve(folder.trim())))
        .filter((folder) => folder.length > 0)
    )
  ].slice(0, 50)
  await dataRepositories().settings.write(LIBRARY_FOLDERS_KEY, clean)
  return clean
}

async function toItem(entry: TemplateLibraryEntry): Promise<TemplateLibraryItem> {
  let thumbnailDataUrl: string | null = null
  if (entry.thumbnailPath) {
    try {
      thumbnailDataUrl = `data:image/png;base64,${(await readFile(entry.thumbnailPath)).toString('base64')}`
    } catch {
      thumbnailDataUrl = null
    }
  }
  return { ...entry, thumbnailDataUrl }
}

export async function listLibrary(approvedOnly: boolean): Promise<TemplateLibraryItem[]> {
  const entries = await dataRepositories().templateLibrary.list()
  return Promise.all(
    entries.filter((entry) => !approvedOnly || entry.status === 'approved').map(toItem)
  )
}

export async function indexLibrary(): Promise<TemplateLibraryStatus> {
  const folders = await libraryFolders()
  const errors: string[] = []
  const found = new Set<string>()
  const successfulFolders = new Set<string>()
  const thumbnailDirectory = join(userDataPaths().root, 'library-thumbnails')
  await mkdir(thumbnailDirectory, { recursive: true })
  for (const folder of folders) {
    let files: string[]
    try {
      files = await findTemplates(folder)
      successfulFolders.add(folder)
    } catch (error) {
      errors.push(`${folder}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    for (const path of files) {
      const id = libraryId(path)
      found.add(id)
      try {
        const bytes = await readFile(path)
        const opened = decodeArchiveResult(bytes)
        const file = await stat(path)
        const preview = readArchivePreview(bytes)
        const thumbnailPath = preview ? join(thumbnailDirectory, `${id}.png`) : null
        if (preview && thumbnailPath) await writeFile(thumbnailPath, preview)
        const metadata = opened.document.template.metadata
        await dataRepositories().templateLibrary.upsert({
          id,
          path,
          title: metadata.title || basename(path, extname(path)),
          description: metadata.description,
          tags: metadata.tags,
          status: metadata.status,
          thumbnailPath,
          modifiedAt: file.mtime.toISOString(),
          indexedAt: new Date().toISOString()
        })
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  for (const existing of await dataRepositories().templateLibrary.list()) {
    const configuredRoot = folders.find((folder) => {
      const child = relative(folder, existing.path)
      return child === '' || (!child.startsWith('..') && !isAbsolute(child))
    })
    if (!found.has(existing.id) && (!configuredRoot || successfulFolders.has(configuredRoot)))
      await dataRepositories().templateLibrary.remove(existing.id)
  }
  const entries = await listLibrary(false)
  return {
    folders,
    entries,
    errors,
    indexedAt: new Date().toISOString()
  }
}

export async function readLibraryTemplate(id: string) {
  const entry = (await dataRepositories().templateLibrary.list()).find((item) => item.id === id)
  if (!entry) throw new Error('The library template was not found. Re-index the library.')
  return { item: await toItem(entry), opened: decodeArchiveResult(await readFile(entry.path)) }
}
