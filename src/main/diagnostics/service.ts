/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { app, screen, shell } from 'electron'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { arch, release, totalmem, userInfo, version as osVersion } from 'node:os'
import { basename, extname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { DiagnosticBundleOptions, DiagnosticBundleResult } from '@shared/diagnostics'
import { dataRepositories, dataStoreManager } from '../data'
import { readBuildInfo } from '../buildInfo'
import { readIntegrationConfiguration } from '../server/config'
import { SettingsStoreFile } from '../storage/settings'
import { userDataPaths } from '../storage/paths'
import { createDiagnosticArchive } from './bundle'
import { diagnosticLog } from '.'
import { strFromU8, unzipSync } from 'fflate'

interface PrinterDiagnostic {
  name: string
  driver: string
}

async function readFiles(directory: string, pattern?: RegExp): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {}
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || (pattern && !pattern.test(entry.name))) continue
      result[basename(entry.name)] = new Uint8Array(await readFile(join(directory, entry.name)))
    }
  } catch {
    // A missing optional directory is represented by an empty section.
  }
  return result
}

async function printers(): Promise<PrinterDiagnostic[]> {
  if (process.platform !== 'win32') return []
  try {
    const script =
      '@(Get-CimInstance Win32_Printer | Select-Object Name,DriverName) | ConvertTo-Json -Compress'
    const { stdout } = await promisify(execFile)(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15_000, maxBuffer: 2_000_000 }
    )
    const parsed = JSON.parse(stdout) as
      { Name?: string; DriverName?: string } | Array<{ Name?: string; DriverName?: string }>
    return (Array.isArray(parsed) ? parsed : [parsed]).map((printer) => ({
      name: printer.Name ?? 'Unknown printer',
      driver: printer.DriverName ?? 'Unknown driver'
    }))
  } catch {
    return []
  }
}

function installType(): 'installed' | 'portable' | 'development' {
  if (!app.isPackaged) return 'development'
  return process.env['PORTABLE_EXECUTABLE_FILE'] ? 'portable' : 'installed'
}

export async function createDiagnosticReport(
  options: DiagnosticBundleOptions
): Promise<DiagnosticBundleResult> {
  const paths = userDataPaths()
  const build = await readBuildInfo()
  const displays = screen.getAllDisplays().map((display) => ({
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor
  }))
  const installedPrinters = await printers()
  const settings = await new SettingsStoreFile().read()
  const publicDatabase = await Promise.resolve()
    .then(() => dataStoreManager().configuration())
    .catch(() => ({ engine: 'unavailable' as const }))
  const integration = await readIntegrationConfiguration().catch(() => ({ enabled: false }))
  const databaseInfo = await (async () => {
    try {
      const repositories = dataRepositories()
      return repositories.diagnosticInfo
        ? await repositories.diagnosticInfo()
        : {
            migration: await repositories.migrationStatus(),
            rowCounts: {},
            integrity: 'unavailable'
          }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })()
  const workspace = await readFile(paths.workspaceFile, 'utf8')
    .then((value) => JSON.parse(value) as unknown)
    .catch(() => ({ status: 'not available' }))
  const systemReport = {
    app: {
      version: app.getVersion(),
      codename: build.codename,
      commit: build.commit,
      buildDate: build.buildDate,
      installType: installType()
    },
    windows: { version: osVersion(), release: release(), architecture: arch() },
    memoryBytes: totalmem(),
    displays,
    locale: app.getLocale(),
    runtime: {
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node
    },
    databaseEngine: publicDatabase.engine,
    integrationServerEnabled: integration.enabled,
    printers: installedPrinters,
    description: options.description.trim()
  }
  const summary = [
    `Barista ${app.getVersion()} “${build.codename}”`,
    `Commit: ${build.commit}`,
    `Build date: ${build.buildDate}`,
    `Install type: ${installType()}`,
    `Windows: ${osVersion()} (${release()}, ${arch()})`,
    `RAM: ${(totalmem() / 1024 ** 3).toFixed(1)} GB`,
    `Displays: ${displays.map((display) => `${display.width}×${display.height} @ ${Math.round(display.scaleFactor * 100)}%`).join(', ') || 'unavailable'}`,
    `Locale: ${app.getLocale()}`,
    `Electron/Chromium/Node: ${process.versions.electron} / ${process.versions.chrome} / ${process.versions.node}`,
    `Database engine: ${publicDatabase.engine}`,
    `Integration server enabled: ${integration.enabled ? 'yes' : 'no'}`,
    `Printers: ${installedPrinters.map((printer) => `${printer.name} (${printer.driver})`).join(', ') || 'none reported'}`,
    '',
    'User description:',
    options.description.trim() || '(none)'
  ].join('\n')
  const logs = Object.fromEntries(
    Object.entries(await readFiles(paths.logsDir, /\.jsonl$/i)).map(([name, bytes]) => [
      name,
      Buffer.from(bytes).toString('utf8')
    ])
  )
  const optionalFiles: Record<string, Uint8Array | string> = {}
  if (options.includeCurrentDocument && options.currentDocumentPath) {
    const extension = extname(options.currentDocumentPath).toLowerCase()
    if (extension !== '.bar') throw new Error('Only an open .bar document can be included.')
    optionalFiles[`optional/current-document${extension}`] = new Uint8Array(
      await readFile(options.currentDocumentPath)
    )
  }
  if (options.includeLastPrintData && options.lastPrintData !== null)
    optionalFiles['optional/last-print-data.json'] =
      `${JSON.stringify(options.lastPrintData, null, 2)}\n`
  const archive = createDiagnosticArchive({
    summary,
    preferences: settings,
    workspace,
    databaseInfo: { configuration: publicDatabase, ...databaseInfo },
    systemReport,
    logs,
    crashFiles: await readFiles(app.getPath('crashDumps')),
    optionalFiles,
    username: userInfo().username
  })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `Barista-diagnostic-${app.getVersion()}-${timestamp}.zip`
  await mkdir(paths.diagnosticsDir, { recursive: true })
  const output = join(paths.diagnosticsDir, fileName)
  await writeFile(output, archive.bytes)
  diagnosticLog.info('diagnostics.bundle-created', {
    path: output,
    includedCurrentDocument: options.includeCurrentDocument,
    includedLastPrintData: options.includeLastPrintData,
    entryCount: archive.entries.length
  })
  return { path: output, fileName, entries: archive.entries }
}

function diagnosticPath(path: string): string {
  const root = resolve(userDataPaths().diagnosticsDir)
  const candidate = resolve(path)
  const relation = relative(root, candidate)
  if (!relation || relation.startsWith('..') || relation.includes(':'))
    throw new Error('Diagnostic path is outside the Barista diagnostics folder.')
  return candidate
}

export function showDiagnosticFile(path: string): void {
  const candidate = diagnosticPath(path)
  shell.showItemInFolder(candidate)
}

export async function viewDiagnosticBundle(
  path: string
): Promise<{ entries: string[]; summary: string }> {
  const files = unzipSync(new Uint8Array(await readFile(diagnosticPath(path))))
  return {
    entries: Object.keys(files).sort(),
    summary: files['summary.txt'] ? strFromU8(files['summary.txt']) : 'Summary is unavailable.'
  }
}

export async function openDiagnosticFolder(): Promise<void> {
  await mkdir(userDataPaths().diagnosticsDir, { recursive: true })
  await shell.openPath(userDataPaths().diagnosticsDir)
}

export async function openLogsFolder(): Promise<void> {
  await mkdir(userDataPaths().logsDir, { recursive: true })
  await shell.openPath(userDataPaths().logsDir)
}

export async function readDiagnosticLogs(): Promise<
  import('@shared/diagnostics').DiagnosticLogEntry[]
> {
  const files = await readFiles(userDataPaths().logsDir, /\.jsonl$/i)
  const entries: import('@shared/diagnostics').DiagnosticLogEntry[] = []
  for (const bytes of Object.values(files)) {
    for (const line of Buffer.from(bytes).toString('utf8').split(/\r?\n/).filter(Boolean)) {
      try {
        entries.push(JSON.parse(line) as import('@shared/diagnostics').DiagnosticLogEntry)
      } catch {
        // Ignore incomplete final lines left by a process termination.
      }
    }
  }
  return entries.sort((left, right) => left.timestamp.localeCompare(right.timestamp))
}
