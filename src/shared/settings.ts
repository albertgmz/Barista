/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { z } from 'zod'

export const appSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  defaultPrinterId: z.string().nullable(),
  units: z.enum(['mm', 'in']),
  nudgeSmallMm: z.number().positive().max(100),
  nudgeLargeMm: z.number().positive().max(1000),
  gridSizeMm: z.number().positive().max(1000),
  gridSubdivisions: z.number().int().min(1).max(20),
  showGrid: z.boolean(),
  showRulers: z.boolean(),
  snap: z.object({
    grid: z.boolean(),
    guides: z.boolean(),
    label: z.boolean(),
    objects: z.boolean(),
    printerDots: z.boolean()
  }),
  defaultLabel: z.object({
    widthMm: z.number().positive().max(2000),
    heightMm: z.number().positive().max(2000),
    dpi: z.union([z.literal(203), z.literal(300), z.literal(600)])
  }),
  autosaveMinutes: z.number().min(1).max(60),
  screenDpi: z.number().min(50).max(400),
  preflightMode: z.enum(['warn', 'strict']).default('warn'),
  defaultMode: z.enum(['editor', 'station']).default('editor'),
  updates: z
    .object({
      automaticChecks: z.boolean(),
      automaticDownload: z.boolean()
    })
    .default({ automaticChecks: true, automaticDownload: false }),
  diagnostics: z
    .object({
      level: z.enum(['error', 'warn', 'info', 'debug'])
    })
    .default({ level: 'info' })
})

export type AppSettings = z.infer<typeof appSettingsSchema>

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultPrinterId: null,
  units: 'mm',
  nudgeSmallMm: 0.1,
  nudgeLargeMm: 1,
  gridSizeMm: 5,
  gridSubdivisions: 5,
  showGrid: true,
  showRulers: true,
  snap: { grid: true, guides: true, label: true, objects: true, printerDots: false },
  defaultLabel: { widthMm: 60, heightMm: 35, dpi: 300 },
  autosaveMinutes: 2,
  screenDpi: 96,
  preflightMode: 'warn',
  defaultMode: 'editor',
  updates: { automaticChecks: true, automaticDownload: false },
  diagnostics: { level: 'info' }
}

export function mergeSettings(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return appSettingsSchema.parse({
    ...current,
    ...patch,
    snap: patch.snap ? { ...current.snap, ...patch.snap } : current.snap,
    defaultLabel: patch.defaultLabel
      ? { ...current.defaultLabel, ...patch.defaultLabel }
      : current.defaultLabel,
    updates: patch.updates ? { ...current.updates, ...patch.updates } : current.updates,
    diagnostics: patch.diagnostics
      ? { ...current.diagnostics, ...patch.diagnostics }
      : current.diagnostics
  })
}
