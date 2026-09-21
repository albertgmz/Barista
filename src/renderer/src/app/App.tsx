/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import '../editor/document.css'
import { useDocumentLifecycle } from '../editor/useDocumentLifecycle'
import { lazy, Suspense, useEffect, useState, type JSX } from 'react'
import { Toaster } from '@fluentui/react-components'
import { AppLayout } from './AppLayout'
import { ThemeBridge } from './ThemeBridge'
import { CommandProvider } from '../commands/CommandProvider'
import { useWorkspace } from '../workspace/useWorkspace'
import { usePageZoomGuard } from './usePageZoomGuard'
import { useUiStore } from '../store'

const AboutDialog = lazy(() =>
  import('./AboutDialog').then((module) => ({ default: module.AboutDialog }))
)
const LicensesDialog = lazy(() =>
  import('./LicensesDialog').then((module) => ({ default: module.LicensesDialog }))
)
const DiagnosticReportDialog = lazy(() =>
  import('./DiagnosticReportDialog').then((module) => ({ default: module.DiagnosticReportDialog }))
)
const LogViewerDialog = lazy(() =>
  import('./LogViewerDialog').then((module) => ({ default: module.LogViewerDialog }))
)
const PrintDialog = lazy(() =>
  import('../print/PrintDialog').then((module) => ({ default: module.PrintDialog }))
)
const LabelSetupDialog = lazy(() =>
  import('../editor/LabelSetupDialog').then((module) => ({ default: module.LabelSetupDialog }))
)
const NewLabelDialog = lazy(() =>
  import('../editor/NewLabelDialog').then((module) => ({ default: module.NewLabelDialog }))
)
const VariableBindingDialog = lazy(() =>
  import('../editor/VariableBindingDialog').then((module) => ({
    default: module.VariableBindingDialog
  }))
)
const DataSourceDialog = lazy(() =>
  import('../dataSources/DataSourceDialog').then((module) => ({
    default: module.DataSourceDialog
  }))
)
const Gs1BuilderDialog = lazy(() =>
  import('../editor/Gs1BuilderDialog').then((module) => ({ default: module.Gs1BuilderDialog }))
)
const PreferencesDialog = lazy(() =>
  import('./PreferencesDialog').then((module) => ({ default: module.PreferencesDialog }))
)
const PrintHistoryDialog = lazy(() =>
  import('../print/PrintHistoryDialog').then((module) => ({ default: module.PrintHistoryDialog }))
)
import { usePreferences } from './usePreferences'
import { StationApp } from '../station/StationApp'
import { useFonts } from './useFonts'
import { CrashNotice } from './CrashNotice'
import { PreflightAlerts } from './PreflightAlerts'

/** Everything below the theme provider, so Fluent hooks have their context. */
function AppShell(): JSX.Element {
  useDocumentLifecycle()
  useWorkspace()
  usePageZoomGuard()
  usePreferences()
  useFonts()
  const newLabelOpen = useUiStore((state) => state.isNewLabelOpen),
    dataSourceOpen = useUiStore((state) => state.isDataSourceOpen),
    gs1BuilderOpen = useUiStore((state) => state.isGs1BuilderOpen),
    variableBindingOpen = useUiStore((state) => state.isVariableBindingOpen),
    aboutOpen = useUiStore((state) => state.isAboutDialogOpen),
    licensesOpen = useUiStore((state) => state.isLicensesOpen),
    diagnosticReportOpen = useUiStore((state) => state.isDiagnosticReportOpen),
    logViewerOpen = useUiStore((state) => state.isLogViewerOpen),
    printOpen = useUiStore((state) => state.isPrintDialogOpen),
    labelSetupOpen = useUiStore((state) => state.isLabelSetupOpen),
    preferencesOpen = useUiStore((state) => state.isPreferencesOpen),
    printHistoryOpen = useUiStore((state) => state.isPrintHistoryOpen)

  return (
    <CommandProvider>
      <CrashNotice />
      <PreflightAlerts />
      <AppLayout />
      <Suspense fallback={null}>
        {aboutOpen && <AboutDialog />}
        {licensesOpen && <LicensesDialog />}
        {diagnosticReportOpen && <DiagnosticReportDialog />}
        {logViewerOpen && <LogViewerDialog />}
        {newLabelOpen && <NewLabelDialog />}
        {dataSourceOpen && <DataSourceDialog />}
        {gs1BuilderOpen && <Gs1BuilderDialog />}
        {variableBindingOpen && <VariableBindingDialog />}
        {printOpen && <PrintDialog />}
        {labelSetupOpen && !printOpen && <LabelSetupDialog />}
        {preferencesOpen && <PreferencesDialog />}
        {printHistoryOpen && <PrintHistoryDialog />}
      </Suspense>
      <Toaster position="bottom-end" pauseOnHover />
    </CommandProvider>
  )
}

export function App(): JSX.Element {
  const [mode, setMode] = useState<'editor' | 'station' | null>(null)
  useEffect(() => {
    void window.barista
      .invoke('station:mode')
      .then((result) => setMode(result.ok ? result.value.mode : 'editor'))
  }, [])
  return (
    <ThemeBridge>
      {mode === 'station' ? <StationApp onOpenEditor={() => setMode('editor')} /> : null}
      {mode === 'editor' ? <AppShell /> : null}
    </ThemeBridge>
  )
}
