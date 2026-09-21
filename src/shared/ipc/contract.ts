/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { PrintSettings } from '../printSettings'
/**
 * The typed IPC contract.
 *
 * This file is the single source of truth for every message crossing the
 * process boundary. The main process registers handlers against
 * {@link IpcInvokeMap}, the preload script exposes an allowlisted bridge built
 * from {@link IPC_INVOKE_CHANNELS}, and the renderer calls it through
 * {@link BaristaApi}. Adding a channel means adding it here first; anything not
 * listed is rejected by the preload bridge.
 */

import type { WorkspaceLayout } from '../workspace'
import type { LabelDocument, AssetRef, DataSourceDefinition } from '../template/types'
import type {
  DataSourceReadResult,
  DataSourceRecordSelection,
  WorkbookSourceInfo
} from '../dataSources'
import type { StockPreset } from '../template/stockPresets'
import type { OpenedLabel, RecoveryRecord } from '../format/types'
import type { AppSettings } from '../settings'
import type { ClipboardReadResult, ClipboardWriteRequest } from '../clipboard'
import type { FontCatalog, FontFamilyInfo } from '../fonts'
import type {
  DataConfiguration,
  DataConfigurationInput,
  DataConfigurationSaveResult,
  DataConnectionTestResult,
  DataRuntimeStatus
} from '../dataSettings'
import type {
  StationModeInfo,
  StationSecurityStatus,
  StationHistoryAction,
  TemplateLibraryItem,
  TemplateLibraryStatus
} from '../station'
import type {
  IntegrationConfiguration,
  IntegrationStatus,
  IntegrationTokenCreated,
  IntegrationScope
} from '../integration'
import type { UpdateState } from '../updates'
import type { ThirdPartyLicense } from '../licenses'
import type {
  CrashNotice,
  DiagnosticBundleOptions,
  DiagnosticBundleResult,
  DiagnosticLogEntry,
  EditorBreadcrumb
} from '../diagnostics'
export type { AppSettings } from '../settings'

/* -------------------------------------------------------------------------- */
/* Result envelope                                                            */
/* -------------------------------------------------------------------------- */

export type IpcErrorCode =
  'not-implemented' | 'not-found' | 'invalid-input' | 'io-error' | 'cancelled'

/**
 * The same members at runtime, for validating a code that crossed a process
 * boundary. A `Record` keyed by the union is exhaustive in both directions, as
 * the channel allowlists below are.
 */
const ERROR_CODES = {
  'not-implemented': true,
  'not-found': true,
  'invalid-input': true,
  'io-error': true,
  cancelled: true
} satisfies Record<IpcErrorCode, true>

export const IPC_ERROR_CODES = Object.keys(ERROR_CODES) as readonly IpcErrorCode[]

export interface IpcError {
  code: IpcErrorCode
  message: string
}

/**
 * Every fallible channel returns this envelope instead of rejecting. A thrown
 * error in the main process crosses IPC as an opaque string, which loses the
 * error code the renderer needs in order to react.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcError }

export function ok<T>(value: T): IpcResult<T> {
  return { ok: true, value }
}

export function fail<T = never>(code: IpcErrorCode, message: string): IpcResult<T> {
  return { ok: false, error: { code, message } }
}

/** Standard response for the stubs that are not wired up yet. */
export function notImplemented<T = never>(feature: string): IpcResult<T> {
  return fail<T>('not-implemented', `${feature} is not implemented yet.`)
}

/* -------------------------------------------------------------------------- */
/* Domain payloads                                                            */
/* -------------------------------------------------------------------------- */

/** Mirrors Electron's `nativeTheme.themeSource`. */
export type ThemeSource = 'system' | 'light' | 'dark'

/**
 * The members of Node's `NodeJS.Platform`, spelled out.
 *
 * This module is compiled into the renderer too, which has no Node type
 * definitions, so it cannot name the `NodeJS` namespace. Listing the members
 * keeps `process.platform` assignable without dragging Node types into the web
 * project.
 */
export type Platform =
  | 'aix'
  | 'android'
  | 'cygwin'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'netbsd'
  | 'openbsd'
  | 'sunos'
  | 'win32'

export interface ThemeInfo {
  source: ThemeSource
  /** What the renderer should actually paint right now. */
  shouldUseDarkColors: boolean
}

export interface AppInfo {
  name: string
  version: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  platform: Platform
  isPackaged: boolean
  codename: string
  buildDate: string
  commit: string
  installType: 'installed' | 'portable' | 'development'
  /** Root of all user data. Nothing is ever written to the install folder. */
  userDataPath: string
}

export interface RecentFile {
  path: string
  name: string
  /** ISO-8601 timestamp of the last time the file was opened. */
  openedAt: string
}

export interface PrinterInfo {
  paperWidthMm?: number
  paperHeightMm?: number
  marginMm?: number
  /** Stable identifier used when submitting a job. */
  id: string
  name: string
  displayName: string
  isDefault: boolean
  /** Which adapter can drive this printer. */
  transport: PrinterTransport
  status: string
}

/** How bytes reach the printer. */
export type PrinterTransport = 'driver' | 'raw-spooler' | 'network-9100'

export interface PrintJobRequest {
  document: LabelDocument
  settings: PrintSettings
  printerId: string
  copies: number
  serializedLabels: number
  /** Resolved values for the template's prompt variables, keyed by name. */
  values: Record<string, string>
  /** Selected spreadsheet records. Empty means normal serialized printing. */
  records?: DataSourceRecordSelection[]
}

export interface PrintJobResult {
  jobId: string
  submittedAt: string
  serialRange?: string
}
export interface PrintHistoryEntry {
  id: string
  date: string
  user: string
  computer: string
  template: string
  printer: string
  serialRange: string
  serializedLabels: number
  copies: number
  result: 'done' | 'failed'
  error?: string
}

/* -------------------------------------------------------------------------- */
/* Channel maps                                                               */
/* -------------------------------------------------------------------------- */

/** Renderer -> main, request/response. */
export interface IpcInvokeMap {
  'app:getInfo': { request: void; response: AppInfo }
  'app:exit': { request: void; response: void }
  'app:openExternal': {
    request: 'repository' | 'releases' | 'gpl'
    response: void
  }
  'licenses:list': { request: void; response: IpcResult<ThirdPartyLicense[]> }
  'updates:getState': { request: void; response: UpdateState }
  'updates:check': { request: void; response: UpdateState }
  'updates:download': { request: void; response: UpdateState }
  'updates:install': { request: void; response: UpdateState }
  'updates:openReleases': { request: void; response: void }
  'diagnostics:create': {
    request: DiagnosticBundleOptions
    response: IpcResult<DiagnosticBundleResult>
  }
  'diagnostics:logs': { request: void; response: IpcResult<DiagnosticLogEntry[]> }
  'diagnostics:openLogsFolder': { request: void; response: IpcResult<void> }
  'diagnostics:openFolder': { request: void; response: IpcResult<void> }
  'diagnostics:showFile': { request: { path: string }; response: IpcResult<void> }
  'diagnostics:crashNotice': { request: void; response: CrashNotice | null }
  'diagnostics:dismissCrashNotice': { request: { id: string }; response: void }
  'diagnostics:viewBundle': {
    request: { path: string }
    response: IpcResult<{ entries: string[]; summary: string }>
  }
  'diagnostics:copyLogs': { request: { text: string }; response: IpcResult<void> }
  /**
   * Records one editor breadcrumb in the log. It cannot fail from the
   * renderer's point of view: the main process validates the payload against
   * {@link EditorBreadcrumb} and drops anything it does not recognise, because
   * a rejected breadcrumb is not something the editor could act on.
   */
  'diagnostics:breadcrumb': { request: EditorBreadcrumb; response: void }
  'window:minimize': { request: void; response: void }
  'window:toggleMaximize': { request: void; response: void }
  'window:close': { request: void; response: void }
  'workspace:read': { request: void; response: IpcResult<WorkspaceLayout> }
  'workspace:write': { request: WorkspaceLayout; response: IpcResult<void> }

  'theme:get': { request: void; response: ThemeInfo }
  'theme:set': { request: ThemeSource; response: ThemeInfo }

  'template:showOpenDialog': { request: void; response: IpcResult<string | null> }
  'template:showSaveDialog': {
    request: { suggestedName: string }
    response: IpcResult<string | null>
  }
  'template:read': { request: { path: string }; response: IpcResult<OpenedLabel> }
  'template:write': {
    request: { path: string; document: LabelDocument }
    response: IpcResult<void>
  }
  'template:listRecent': { request: void; response: IpcResult<RecentFile[]> }
  'template:clearRecent': { request: void; response: IpcResult<void> }
  'stockPreset:list': {
    request: void
    response: IpcResult<{ custom: StockPreset[]; recent: StockPreset[] }>
  }
  'stockPreset:save': { request: StockPreset; response: IpcResult<void> }
  'stockPreset:delete': { request: { id: string }; response: IpcResult<void> }
  'stockPreset:touch': { request: StockPreset; response: IpcResult<void> }
  'template:recoveryRead': { request: void; response: IpcResult<RecoveryRecord | null> }
  'template:recoveryWrite': {
    request: { document: LabelDocument; originalPath: string | null }
    response: IpcResult<void>
  }
  'template:recoveryDiscard': { request: void; response: IpcResult<void> }
  'library:showFolderDialog': { request: void; response: IpcResult<string | null> }
  'library:folders': { request: void; response: IpcResult<string[]> }
  'library:setFolders': { request: { folders: string[] }; response: IpcResult<string[]> }
  'library:index': { request: void; response: IpcResult<TemplateLibraryStatus> }
  'library:list': {
    request: { approvedOnly: boolean }
    response: IpcResult<TemplateLibraryItem[]>
  }
  'library:read': {
    request: { id: string }
    response: IpcResult<{ item: TemplateLibraryItem; document: LabelDocument }>
  }
  'station:mode': { request: void; response: IpcResult<StationModeInfo> }
  'station:security': { request: void; response: IpcResult<StationSecurityStatus> }
  'station:setAdminPin': {
    request: { currentPin: string; newPin: string | null }
    response: IpcResult<StationSecurityStatus>
  }
  'station:openEditor': { request: { pin: string }; response: IpcResult<void> }
  'station:exit': { request: { pin: string }; response: IpcResult<void> }
  'station:historyActions': { request: void; response: IpcResult<StationHistoryAction[]> }
  'station:recordHistoryAction': {
    request: { jobId: string; action: 'reprint' | 'void'; reason: string }
    response: IpcResult<StationHistoryAction>
  }

  'asset:import': { request: void; response: IpcResult<{ asset: AssetRef; data: string } | null> }
  'fonts:list': { request: void; response: IpcResult<FontCatalog> }
  'fonts:import': { request: void; response: IpcResult<FontFamilyInfo | null> }
  'fonts:remove': { request: { id: string }; response: IpcResult<void> }
  'clipboard:read': { request: void; response: IpcResult<ClipboardReadResult> }
  'clipboard:write': { request: ClipboardWriteRequest; response: IpcResult<void> }
  'document:confirm': { request: void; response: IpcResult<'save' | 'discard' | 'cancel'> }
  'document:close': { request: void; response: void }
  'document:pending': { request: void; response: string | null }
  'print:settingsRead': { request: { printerId: string }; response: IpcResult<PrintSettings> }
  'print:settingsWrite': {
    request: { printerId: string; settings: PrintSettings }
    response: IpcResult<void>
  }
  'print:properties': {
    request: { printerId: string; devMode?: string }
    response: IpcResult<string | null>
  }
  'print:preview': {
    request: { document?: LabelDocument; documentId: string; settings: PrintSettings }
    response: IpcResult<string>
  }
  'document:export': {
    request: { document: LabelDocument; format: 'pdf' | 'png' }
    response: IpcResult<string | null>
  }
  'printer:list': { request: void; response: IpcResult<PrinterInfo[]> }
  'print:submit': { request: PrintJobRequest; response: IpcResult<PrintJobResult> }
  'print:history': { request: void; response: IpcResult<PrintHistoryEntry[]> }
  'print:promptValuesRead': {
    request: { templateId: string }
    response: IpcResult<Record<string, string>>
  }
  'print:promptValuesWrite': {
    request: { templateId: string; values: Record<string, string> }
    response: IpcResult<void>
  }
  'dataSource:showOpenDialog': { request: void; response: IpcResult<string | null> }
  'dataSource:inspect': {
    request: { path: string; documentPath: string | null }
    response: IpcResult<WorkbookSourceInfo>
  }
  'dataSource:headers': {
    request: {
      path: string
      documentPath: string | null
      selection: DataSourceDefinition['selection']
      headerRow: number
    }
    response: IpcResult<string[]>
  }
  'dataSource:read': {
    request: { source: DataSourceDefinition; documentPath: string | null }
    response: IpcResult<DataSourceReadResult>
  }
  'dataSource:watch': {
    request: { source: DataSourceDefinition; documentPath: string | null }
    response: IpcResult<void>
  }
  'dataSource:unwatch': { request: { sourceId: string }; response: IpcResult<void> }
  'dataSource:void': {
    request: { dataSourceId: string; recordKey: string; reason: string }
    response: IpcResult<void>
  }

  'settings:read': { request: void; response: IpcResult<AppSettings> }
  'settings:write': { request: Partial<AppSettings>; response: IpcResult<AppSettings> }
  'data:configuration': { request: void; response: IpcResult<DataConfiguration> }
  'data:saveConfiguration': {
    request: DataConfigurationInput
    response: IpcResult<DataConfigurationSaveResult>
  }
  'data:testConnection': {
    request: DataConfigurationInput
    response: IpcResult<DataConnectionTestResult>
  }
  'data:status': { request: void; response: IpcResult<DataRuntimeStatus> }
  'integration:status': { request: void; response: IpcResult<IntegrationStatus> }
  'integration:save': {
    request: IntegrationConfiguration
    response: IpcResult<IntegrationStatus>
  }
  'integration:createToken': {
    request: { name: string; scopes: IntegrationScope[] }
    response: IpcResult<IntegrationTokenCreated>
  }
  'integration:revokeToken': { request: { id: string }; response: IpcResult<void> }
}

/** Main -> renderer, fire and forget. */
export interface IpcEventMap {
  'document:open': string
  'document:closeRequested': void
  'print:status': {
    jobId: string
    state: 'queued' | 'printing' | 'done' | 'failed'
    error?: string
  }
  'splash:status': SplashStatus
  'workspace:flush': void
  'theme:changed': ThemeInfo
  'dataSource:changed': { sourceId: string; path: string }
  'updates:state': UpdateState
}

export type IpcInvokeChannel = keyof IpcInvokeMap
export type IpcEventChannel = keyof IpcEventMap

export type IpcRequest<C extends IpcInvokeChannel> = IpcInvokeMap[C]['request']
export type IpcResponse<C extends IpcInvokeChannel> = IpcInvokeMap[C]['response']
export type IpcEventPayload<C extends IpcEventChannel> = IpcEventMap[C]

/** Channels taking no request are called with no argument at all. */
export type InvokeArgs<C extends IpcInvokeChannel> =
  IpcRequest<C> extends void ? [] : [request: IpcRequest<C>]

/**
 * Runtime allowlists. The preload bridge refuses any channel absent from these,
 * so a compromised renderer cannot reach arbitrary `ipcRenderer` channels.
 *
 * They are declared as a total `Record` keyed by the channel union rather than
 * as an array. An array constrained with `satisfies readonly IpcInvokeChannel[]`
 * only checks each element, so it catches a bogus extra entry but NOT a missing
 * one — and missing is the direction that matters: a channel added to the map
 * with a working handler but forgotten here would compile, ship, and then be
 * blocked at runtime. A `Record` is exhaustive, so both directions fail to
 * compile.
 */
const INVOKE_CHANNELS = {
  'app:getInfo': true,
  'app:exit': true,
  'app:openExternal': true,
  'licenses:list': true,
  'updates:getState': true,
  'updates:check': true,
  'updates:download': true,
  'updates:install': true,
  'updates:openReleases': true,
  'diagnostics:create': true,
  'diagnostics:logs': true,
  'diagnostics:openLogsFolder': true,
  'diagnostics:openFolder': true,
  'diagnostics:showFile': true,
  'diagnostics:crashNotice': true,
  'diagnostics:dismissCrashNotice': true,
  'diagnostics:viewBundle': true,
  'diagnostics:copyLogs': true,
  'diagnostics:breadcrumb': true,
  'window:minimize': true,
  'window:toggleMaximize': true,
  'window:close': true,
  'workspace:read': true,
  'workspace:write': true,
  'theme:get': true,
  'theme:set': true,
  'template:showOpenDialog': true,
  'template:showSaveDialog': true,
  'template:read': true,
  'template:write': true,
  'template:listRecent': true,
  'template:clearRecent': true,
  'stockPreset:list': true,
  'stockPreset:save': true,
  'stockPreset:delete': true,
  'stockPreset:touch': true,
  'template:recoveryRead': true,
  'template:recoveryWrite': true,
  'template:recoveryDiscard': true,
  'library:showFolderDialog': true,
  'library:folders': true,
  'library:setFolders': true,
  'library:index': true,
  'library:list': true,
  'library:read': true,
  'station:mode': true,
  'station:security': true,
  'station:setAdminPin': true,
  'station:openEditor': true,
  'station:exit': true,
  'station:historyActions': true,
  'station:recordHistoryAction': true,
  'asset:import': true,
  'fonts:list': true,
  'fonts:import': true,
  'fonts:remove': true,
  'clipboard:read': true,
  'clipboard:write': true,
  'document:confirm': true,
  'document:close': true,
  'document:pending': true,
  'print:settingsRead': true,
  'print:settingsWrite': true,
  'print:properties': true,
  'print:preview': true,
  'document:export': true,
  'printer:list': true,
  'print:submit': true,
  'print:history': true,
  'print:promptValuesRead': true,
  'print:promptValuesWrite': true,
  'dataSource:showOpenDialog': true,
  'dataSource:inspect': true,
  'dataSource:headers': true,
  'dataSource:read': true,
  'dataSource:watch': true,
  'dataSource:unwatch': true,
  'dataSource:void': true,
  'settings:read': true,
  'settings:write': true,
  'data:configuration': true,
  'data:saveConfiguration': true,
  'data:testConnection': true,
  'data:status': true,
  'integration:status': true,
  'integration:save': true,
  'integration:createToken': true,
  'integration:revokeToken': true
} satisfies Record<IpcInvokeChannel, true>

const EVENT_CHANNELS = {
  'document:open': true,
  'document:closeRequested': true,
  'print:status': true,
  'splash:status': true,
  'workspace:flush': true,
  'theme:changed': true,
  'dataSource:changed': true,
  'updates:state': true
} satisfies Record<IpcEventChannel, true>

export const IPC_INVOKE_CHANNELS = Object.keys(INVOKE_CHANNELS) as readonly IpcInvokeChannel[]

export const IPC_EVENT_CHANNELS = Object.keys(EVENT_CHANNELS) as readonly IpcEventChannel[]

/* -------------------------------------------------------------------------- */
/* Bridge surface                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The entire API exposed on `window.barista`. Three functions are the whole
 * surface: everything else is described by the channel maps.
 */
export interface BaristaApi {
  send<C extends keyof IpcSendMap>(channel: C): void
  invoke<C extends IpcInvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<IpcResponse<C>>
  /** Subscribes to a main-process event. Returns an unsubscribe function. */
  on<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventPayload<C>) => void
  ): () => void
}

/** Renderer-to-main notifications are separate from main-to-renderer events. */
export interface IpcSendMap {
  'app:ready': void
  'workspace:flushed': void
  'splash:ready': void
}
const SEND_CHANNELS = {
  'app:ready': true,
  'splash:ready': true,
  'workspace:flushed': true
} satisfies Record<keyof IpcSendMap, true>
export const IPC_SEND_CHANNELS = Object.keys(SEND_CHANNELS) as readonly (keyof IpcSendMap)[]
export interface SplashStatus {
  name: string
  version: string
  codename: string
  status: string
  progress: number
}
export interface SplashApi {
  ready: () => void
  onStatus: (listener: (status: SplashStatus) => void) => () => void
}
