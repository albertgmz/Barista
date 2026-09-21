/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app, dialog, nativeImage } from 'electron'
import type { FileFilter, OpenDialogOptions, SaveDialogOptions } from 'electron'
import { TemplateStore } from '@main/storage/templates'
import { getMainWindow } from '@main/windows/mainWindow'
import { fromService, handle } from './typedIpc'
import { renderPng } from '@main/printing/renderWindow'
import { dataRepositories } from '@main/data'
import { stockSchema } from '@shared/template/schema'
import type { StockPreset } from '@shared/template/stockPresets'
import { z } from 'zod'

const OPEN_FILTERS: FileFilter[] = [
  { name: 'Barista labels', extensions: ['bar'] },
  { name: 'All files', extensions: ['*'] }
]
const SAVE_FILTERS: FileFilter[] = [{ name: 'Barista label', extensions: ['bar'] }]

const store = new TemplateStore({
  appVersion: app.getVersion(),
  // A thumbnail has no operator and no spreadsheet row, so it samples its data
  // the way the design canvas does.
  renderPreview: async (document) => {
    const full = nativeImage.createFromBuffer(
      Buffer.from(await renderPng(document, { sample: true }))
    )
    const { width, height } = full.getSize()
    const resized =
      width >= height
        ? full.resize({ width: Math.min(width, 320), quality: 'best' })
        : full.resize({ height: Math.min(height, 320), quality: 'best' })
    return resized.toPNG()
  }
})
const presetSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  category: z.enum([
    'Recent',
    'My Presets',
    'Thermal – inches',
    'Thermal – metric',
    'Sheets',
    'Small industrial'
  ]),
  units: z.enum(['in', 'mm']),
  stock: stockSchema,
  custom: z.boolean().optional()
})
const presetListSchema = z.array(presetSchema).max(100)
const CUSTOM_PRESETS_KEY = 'label.customStockPresets'
const RECENT_PRESETS_KEY = 'label.recentStockPresets'

async function readPresets(key: string): Promise<StockPreset[]> {
  const value = await dataRepositories().settings.read<unknown>(key)
  return value === null ? [] : presetListSchema.parse(value)
}

export function registerTemplateIpc(): void {
  handle('template:showOpenDialog', () =>
    fromService('Choosing a label to open', async () => {
      const options: OpenDialogOptions = {
        title: 'Open label',
        filters: OPEN_FILTERS,
        properties: ['openFile']
      }
      // Parented so the dialog is modal and cannot be lost behind the window.
      const parent = getMainWindow()
      const result = await (parent === null
        ? dialog.showOpenDialog(options)
        : dialog.showOpenDialog(parent, options))

      // Backing out of the dialog is a normal outcome, not a failure.
      if (result.canceled) return null
      return result.filePaths[0] ?? null
    })
  )

  handle('template:showSaveDialog', (request) =>
    fromService('Choosing where to save', async () => {
      const options: SaveDialogOptions = {
        title: 'Save label as',
        defaultPath: request.suggestedName,
        filters: SAVE_FILTERS
      }
      const parent = getMainWindow()
      const result = await (parent === null
        ? dialog.showSaveDialog(options)
        : dialog.showSaveDialog(parent, options))

      if (result.canceled || result.filePath === '') return null
      return result.filePath
    })
  )

  handle('template:read', (request) =>
    fromService('Reading a template', () => store.read(request.path))
  )

  handle('template:write', (request) =>
    fromService('Writing a template', () => store.write(request.path, request.document))
  )

  handle('template:listRecent', () =>
    fromService('Listing recent templates', () => store.listRecent())
  )
  handle('template:clearRecent', () =>
    fromService('Clearing recent templates', () => store.clearRecent())
  )

  handle('stockPreset:list', () =>
    fromService('Loading label presets', async () => ({
      custom: await readPresets(CUSTOM_PRESETS_KEY),
      recent: await readPresets(RECENT_PRESETS_KEY)
    }))
  )
  handle('stockPreset:save', (request) =>
    fromService('Saving a label preset', async () => {
      const preset = presetSchema.parse({ ...request, category: 'My Presets', custom: true })
      const existing = await readPresets(CUSTOM_PRESETS_KEY)
      await dataRepositories().settings.write(CUSTOM_PRESETS_KEY, [
        preset,
        ...existing.filter((item) => item.id !== preset.id)
      ])
    })
  )
  handle('stockPreset:delete', (request) =>
    fromService('Deleting a label preset', async () => {
      const id = z.string().min(1).max(200).parse(request.id)
      await dataRepositories().settings.write(
        CUSTOM_PRESETS_KEY,
        (await readPresets(CUSTOM_PRESETS_KEY)).filter((item) => item.id !== id)
      )
    })
  )
  handle('stockPreset:touch', (request) =>
    fromService('Remembering a recent label preset', async () => {
      const preset = presetSchema.parse({ ...request, category: 'Recent', custom: false })
      const existing = await readPresets(RECENT_PRESETS_KEY)
      await dataRepositories().settings.write(
        RECENT_PRESETS_KEY,
        [preset, ...existing.filter((item) => item.id !== preset.id)].slice(0, 8)
      )
    })
  )

  handle('template:recoveryRead', () =>
    fromService('Reading label recovery data', () => store.readRecovery())
  )

  handle('template:recoveryWrite', (request) =>
    fromService('Writing label recovery data', () =>
      store.writeRecovery(request.document, request.originalPath)
    )
  )

  handle('template:recoveryDiscard', () =>
    fromService('Discarding label recovery data', () => store.discardRecovery())
  )
}
