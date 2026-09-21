/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { create } from 'zustand'
import type { ThemeSource } from '@shared/ipc/contract'
import type { AppSettings } from '@shared/settings'
import { DEFAULT_APP_SETTINGS } from '@shared/settings'

interface UiState {
  isGs1BuilderOpen: boolean
  setGs1BuilderOpen: (open: boolean) => void
  isDataSourceOpen: boolean
  setDataSourceOpen: (open: boolean) => void
  previewFields: Record<string, string> | null
  setPreviewFields: (fields: Record<string, string> | null) => void
  isVariableBindingOpen: boolean
  setVariableBindingOpen: (open: boolean) => void
  isNewLabelOpen: boolean
  setNewLabelOpen: (open: boolean) => void
  isLabelSetupOpen: boolean
  setLabelSetupOpen: (open: boolean) => void
  isPreferencesOpen: boolean
  setPreferencesOpen: (open: boolean) => void
  preferences: AppSettings
  applyPreferences: (preferences: AppSettings) => void
  /** What the user picked; `system` follows the OS setting. */
  themeSource: ThemeSource
  /** What the main process says to paint right now. */
  isDark: boolean

  snapToGrid: boolean
  toggleSnap: () => void
  showGrid: boolean
  showRulers: boolean
  /**
   * Whether the canvas resolves `{variable}` tokens to their values. On by
   * default, so a date variable reads as a date; the View menu turns it off to
   * show the raw expressions instead, and hovering an object reveals its
   * expression either way.
   */
  showSampleData: boolean
  gridSizeMm: number

  isPrintDialogOpen: boolean
  isAboutDialogOpen: boolean
  isLicensesOpen: boolean
  isDiagnosticReportOpen: boolean
  isLogViewerOpen: boolean
  isPrintHistoryOpen: boolean
  /** Placeholder until the printer list is wired up. */
  selectedPrinterId: string | null

  setThemeSource: (source: ThemeSource) => void
  setIsDark: (isDark: boolean) => void
  toggleGrid: () => void
  toggleRulers: () => void
  toggleSampleData: () => void
  setShowSampleData: (showSampleData: boolean) => void
  setPrintDialogOpen: (open: boolean) => void
  setAboutDialogOpen: (open: boolean) => void
  setLicensesOpen: (open: boolean) => void
  setDiagnosticReportOpen: (open: boolean) => void
  setLogViewerOpen: (open: boolean) => void
  setPrintHistoryOpen: (open: boolean) => void
  setSelectedPrinterId: (printerId: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  isGs1BuilderOpen: false,
  setGs1BuilderOpen: (isGs1BuilderOpen) => set({ isGs1BuilderOpen }),
  isDataSourceOpen: false,
  setDataSourceOpen: (isDataSourceOpen) => set({ isDataSourceOpen }),
  previewFields: null,
  // Picking a record is a request to see it resolved; clearing one only drops
  // back to the sample values, which the view may well already be showing.
  setPreviewFields: (previewFields) =>
    set(previewFields ? { previewFields, showSampleData: true } : { previewFields }),
  isVariableBindingOpen: false,
  setVariableBindingOpen: (isVariableBindingOpen) => set({ isVariableBindingOpen }),
  isNewLabelOpen: false,
  setNewLabelOpen: (isNewLabelOpen) => set({ isNewLabelOpen }),
  isLabelSetupOpen: false,
  setLabelSetupOpen: (isLabelSetupOpen) => set({ isLabelSetupOpen }),
  isPreferencesOpen: false,
  setPreferencesOpen: (isPreferencesOpen) => set({ isPreferencesOpen }),
  preferences: structuredClone(DEFAULT_APP_SETTINGS),
  applyPreferences: (preferences) =>
    set({
      preferences,
      showGrid: preferences.showGrid,
      showRulers: preferences.showRulers,
      gridSizeMm: preferences.gridSizeMm,
      snapToGrid: preferences.snap.grid,
      selectedPrinterId: preferences.defaultPrinterId
    }),
  themeSource: 'system',
  isDark: false,

  snapToGrid: true,
  toggleSnap: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
  showGrid: true,
  showRulers: true,
  showSampleData: true,
  gridSizeMm: 5,

  isPrintDialogOpen: false,
  isAboutDialogOpen: false,
  isLicensesOpen: false,
  isDiagnosticReportOpen: false,
  isLogViewerOpen: false,
  isPrintHistoryOpen: false,
  selectedPrinterId: null,

  setThemeSource: (themeSource) => set({ themeSource }),
  setIsDark: (isDark) => set({ isDark }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleRulers: () => set((state) => ({ showRulers: !state.showRulers })),
  toggleSampleData: () => set((state) => ({ showSampleData: !state.showSampleData })),
  setShowSampleData: (showSampleData) => set({ showSampleData }),
  setPrintDialogOpen: (isPrintDialogOpen) => set({ isPrintDialogOpen }),
  setAboutDialogOpen: (isAboutDialogOpen) => set({ isAboutDialogOpen }),
  setLicensesOpen: (isLicensesOpen) => set({ isLicensesOpen }),
  setDiagnosticReportOpen: (isDiagnosticReportOpen) => set({ isDiagnosticReportOpen }),
  setLogViewerOpen: (isLogViewerOpen) => set({ isLogViewerOpen }),
  setPrintHistoryOpen: (isPrintHistoryOpen) => set({ isPrintHistoryOpen }),
  setSelectedPrinterId: (selectedPrinterId) => set({ selectedPrinterId })
}))
