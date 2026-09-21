/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { dialog } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { z } from 'zod'
import { dataRepositories } from '@main/data'
import { getMainWindow } from '@main/windows/mainWindow'
import { fromService, handle } from './typedIpc'
import {
  indexLibrary,
  libraryFolders,
  listLibrary,
  readLibraryTemplate,
  setLibraryFolders
} from '@main/station/library'
import {
  hashAdminPin,
  PinAttemptLimiter,
  verifyAdminPin,
  type StoredAdminPin
} from '@main/station/pin'
import { approveDocumentClose } from './documentIpc'
import { SettingsStoreFile } from '@main/storage/settings'
import type { StationHistoryAction } from '@shared/station'

const ADMIN_PIN_KEY = 'station.adminPin'
const HISTORY_ACTIONS_KEY = 'station.historyActions'
let editorRequested = false
const pinAttempts = new PinAttemptLimiter()

async function storedPin(): Promise<StoredAdminPin | null> {
  return dataRepositories().settings.read<StoredAdminPin>(ADMIN_PIN_KEY)
}

async function authorize(pin: string): Promise<void> {
  const stored = await storedPin()
  if (!stored) return
  pinAttempts.assertAllowed()
  const valid = await verifyAdminPin(pin, stored)
  pinAttempts.record(valid)
  if (!valid) throw new Error('The admin PIN is incorrect.')
}

export function registerStationIpc(): void {
  handle('station:mode', () =>
    fromService('Reading application mode', async () => ({
      mode:
        !editorRequested &&
        (process.argv.includes('--station') ||
          (await new SettingsStoreFile().read()).defaultMode === 'station')
          ? 'station'
          : 'editor'
    }))
  )
  handle('station:security', () =>
    fromService('Reading station security', async () => ({ hasAdminPin: !!(await storedPin()) }))
  )
  handle('station:setAdminPin', (request) =>
    fromService('Updating station security', async () => {
      const current = await storedPin()
      if (current) await authorize(request.currentPin)
      if (request.newPin === null) await dataRepositories().settings.remove(ADMIN_PIN_KEY)
      else
        await dataRepositories().settings.write(ADMIN_PIN_KEY, await hashAdminPin(request.newPin))
      return { hasAdminPin: request.newPin !== null }
    })
  )
  handle('station:openEditor', (request) =>
    fromService('Opening the editor', async () => {
      await authorize(request.pin)
      editorRequested = true
    })
  )
  handle('station:exit', (request) =>
    fromService('Exiting Station', async () => {
      await authorize(request.pin)
      approveDocumentClose()
      getMainWindow()?.close()
    })
  )
  handle('station:historyActions', () =>
    fromService(
      'Reading station history actions',
      async () =>
        (await dataRepositories().settings.read<StationHistoryAction[]>(HISTORY_ACTIONS_KEY)) ?? []
    )
  )
  handle('station:recordHistoryAction', (request) =>
    fromService('Recording station history action', async () => {
      const parsed = z
        .object({
          jobId: z.string().min(1).max(512),
          action: z.enum(['reprint', 'void']),
          reason: z.string().trim().min(3).max(4096)
        })
        .parse(request)
      const entry: StationHistoryAction = {
        ...parsed,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date: new Date().toISOString()
      }
      const existing =
        (await dataRepositories().settings.read<StationHistoryAction[]>(HISTORY_ACTIONS_KEY)) ?? []
      await dataRepositories().settings.write(
        HISTORY_ACTIONS_KEY,
        [entry, ...existing].slice(0, 1000)
      )
      if (entry.action === 'void') {
        const records = await dataRepositories().settings.read<
          Array<{ dataSourceId: string; key: string }>
        >(`print.jobRecords.${entry.jobId}`)
        for (const record of records ?? []) {
          const tracked = await dataRepositories().printTracking.read(
            record.dataSourceId,
            record.key
          )
          if (tracked?.jobId === entry.jobId)
            await dataRepositories().printTracking.write({
              ...tracked,
              status: 'voided',
              voidReason: entry.reason,
              lastPrintDate: entry.date
            })
        }
      }
      return entry
    })
  )
  handle('library:showFolderDialog', () =>
    fromService('Choosing a template-library folder', async () => {
      const parent = getMainWindow()
      const options: OpenDialogOptions = {
        title: 'Choose template library folder',
        properties: ['openDirectory']
      }
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    })
  )
  handle('library:folders', () => fromService('Reading library folders', libraryFolders))
  handle('library:setFolders', (request) =>
    fromService('Saving library folders', () =>
      setLibraryFolders(z.array(z.string().min(1).max(32_768)).max(50).parse(request.folders))
    )
  )
  handle('library:index', () => fromService('Indexing template library', indexLibrary))
  handle('library:list', (request) =>
    fromService('Listing template library', () => listLibrary(request.approvedOnly))
  )
  handle('library:read', (request) =>
    fromService('Reading library template', async () => {
      const result = await readLibraryTemplate(z.string().length(32).parse(request.id))
      if (result.item.status !== 'approved')
        throw new Error('Only approved templates open in Station.')
      return { item: result.item, document: result.opened.document }
    })
  )
}
