/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, normalize, posix, resolve } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import * as XLSX from 'xlsx'
import type { WorkbookSourceInfo, WorkbookTableInfo } from '@shared/dataSources'
import type { DataSourceDefinition } from '@shared/template/types'

const MAX_WORKBOOK_BYTES = 50 * 1024 * 1024
const MAX_EXPANDED_WORKBOOK_BYTES = 250 * 1024 * 1024
const MAX_WORKBOOK_ENTRIES = 10_000
const MAX_ROWS = 100_000
const MAX_COLUMNS = 1_000
const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv'])

export interface ParsedDataSource {
  path: string
  columns: string[]
  rows: Array<{ key: string; values: Record<string, string>; rowHash: string }>
  warnings: string[]
  modifiedAt: string
}

function xmlText(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([:\w-]+)="([^"]*)"/g)].map((match) => [match[1]!, xmlText(match[2]!)])
  )
}

function zipText(entries: Record<string, Uint8Array>, path: string): string | null {
  const bytes = entries[path]
  return bytes ? strFromU8(bytes) : null
}

function unzipWorkbook(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0,
    count = 0
  return unzipSync(bytes, {
    filter: (entry) => {
      count += 1
      total += entry.originalSize
      if (
        count > MAX_WORKBOOK_ENTRIES ||
        total > MAX_EXPANDED_WORKBOOK_BYTES ||
        entry.originalSize > 100 * 1024 * 1024 ||
        (entry.originalSize > 1_000_000 && entry.originalSize > Math.max(1, entry.size) * 100)
      )
        throw new Error('The Excel workbook expands beyond the safe processing limit.')
      return true
    }
  })
}

/** Extracts true Excel table definitions, which SheetJS CE does not expose as workbook metadata. */
export function excelTables(bytes: Uint8Array): WorkbookTableInfo[] {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return []
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipWorkbook(bytes)
  } catch {
    return []
  }
  const workbook = zipText(entries, 'xl/workbook.xml')
  const workbookRels = zipText(entries, 'xl/_rels/workbook.xml.rels')
  if (!workbook || !workbookRels) return []
  const relationshipTargets = new Map(
    [...workbookRels.matchAll(/<Relationship\b[^>]*>/g)].map((match) => {
      const values = attributes(match[0])
      return [values['Id'], values['Target']] as const
    })
  )
  const sheets = new Map<string, string>()
  for (const match of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const values = attributes(match[0])
    const target = relationshipTargets.get(values['r:id'] ?? '')
    if (!values['name'] || !target) continue
    const sheetPath = posix.normalize(posix.join('xl', target.replace(/^\//, '')))
    sheets.set(sheetPath, values['name'])
  }
  const result: WorkbookTableInfo[] = []
  for (const [sheetPath, sheetName] of sheets) {
    const sheetBase = posix.basename(sheetPath)
    const relsPath = posix.join(posix.dirname(sheetPath), '_rels', `${sheetBase}.rels`)
    const sheetRels = zipText(entries, relsPath)
    if (!sheetRels) continue
    for (const match of sheetRels.matchAll(/<Relationship\b[^>]*>/g)) {
      const values = attributes(match[0])
      if (!values['Type']?.endsWith('/table') || !values['Target']) continue
      const tablePath = posix.normalize(posix.join(posix.dirname(sheetPath), values['Target']))
      const tableXml = zipText(entries, tablePath)
      const tableTag = tableXml?.match(/<table\b[^>]*>/)?.[0]
      if (!tableTag) continue
      const table = attributes(tableTag)
      if (!table['name'] || !table['ref']) continue
      const range = XLSX.utils.decode_range(table['ref'])
      result.push({
        name: table['displayName'] ?? table['name'],
        sheet: sheetName,
        range: table['ref'],
        headerRow: range.s.r + 1
      })
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export function resolveDataSourcePath(sourcePath: string, documentPath: string | null): string {
  if (isAbsolute(sourcePath)) return normalize(sourcePath)
  if (!documentPath) throw new Error('Save the label before using a relative data-source path.')
  return resolve(dirname(documentPath), sourcePath)
}

async function sharedRead(path: string): Promise<Uint8Array> {
  const facts = await stat(path)
  if (facts.size > MAX_WORKBOOK_BYTES) throw new Error('The data source exceeds the 50 MB limit.')
  try {
    return await readFile(path)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES') throw error
    const directory = await mkdtemp(join(tmpdir(), 'barista-data-')),
      temporary = join(directory, `source${extname(path)}`)
    try {
      await copyFile(path, temporary)
      return await readFile(temporary)
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

function openWorkbook(bytes: Uint8Array): XLSX.WorkBook {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) unzipWorkbook(bytes)
  return XLSX.read(bytes, { type: 'array', cellDates: true, dense: false })
}

export async function inspectWorkbook(path: string): Promise<WorkbookSourceInfo> {
  const extension = extname(path).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(extension))
    throw new Error('Choose an .xlsx, .xls or .csv data source.')
  const bytes = await sharedRead(path)
  const workbook = openWorkbook(bytes)
  return {
    path,
    sheets: workbook.SheetNames,
    tables: extension === '.xlsx' ? excelTables(bytes) : []
  }
}

export async function workbookHeaders(
  path: string,
  selection: DataSourceDefinition['selection'],
  headerRow: number
): Promise<string[]> {
  const bytes = await sharedRead(path)
  const workbook = openWorkbook(bytes)
  let sheetName = selection.name
  let range: string | number = headerRow - 1
  if (selection.kind === 'table') {
    const table = excelTables(bytes).find((item) => item.name === selection.name)
    if (!table) throw new Error(`Excel table "${selection.name}" was not found.`)
    sheetName = table.sheet
    range = table.range
  }
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Worksheet "${sheetName}" was not found.`)
  const first = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range,
    raw: false,
    defval: '',
    blankrows: false
  })[0]
  if (!first?.length) throw new Error('The selected header row is empty.')
  return first.map((value, index) => String(value ?? '').trim() || `Column ${index + 1}`)
}

function applyFilter(values: Record<string, string>, source: DataSourceDefinition): boolean {
  const filter = source.filter
  if (!filter) return true
  const actual = (values[filter.column] ?? '').toLocaleLowerCase()
  const expected = filter.value.toLocaleLowerCase()
  if (filter.operator === 'equals') return actual === expected
  if (filter.operator === 'not-equals') return actual !== expected
  if (filter.operator === 'starts-with') return actual.startsWith(expected)
  return actual.includes(expected)
}

function rowHash(values: Record<string, string>): string {
  const stable = Object.keys(values)
    .sort()
    .map((key) => [key, values[key]])
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}

export async function readDataSource(
  source: DataSourceDefinition,
  documentPath: string | null
): Promise<ParsedDataSource> {
  const path = resolveDataSourcePath(source.path, documentPath)
  const extension = extname(path).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(extension))
    throw new Error('Choose an .xlsx, .xls or .csv data source.')
  const bytes = await sharedRead(path)
  const workbook = openWorkbook(bytes)
  let sheetName = source.selection.name
  let range: string | number = source.headerRow - 1
  if (source.selection.kind === 'table') {
    const table = excelTables(bytes).find((item) => item.name === source.selection.name)
    if (!table) throw new Error(`Excel table "${source.selection.name}" was not found.`)
    sheetName = table.sheet
    range = table.range
  }
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Worksheet "${sheetName}" was not found.`)
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range,
    raw: false,
    defval: '',
    blankrows: false
  })
  if (!matrix.length) throw new Error('The selected worksheet or table is empty.')
  if (matrix.length > MAX_ROWS + 1) throw new Error('The data source exceeds 100,000 records.')
  if ((matrix[0]?.length ?? 0) > MAX_COLUMNS)
    throw new Error('The data source exceeds 1,000 columns.')
  const rawHeaders = matrix[0] ?? []
  const warnings: string[] = []
  const seenHeaders = new Set<string>()
  const columns = rawHeaders.map((value, index) => {
    const header = String(value ?? '').trim() || `Column ${index + 1}`
    if (seenHeaders.has(header)) warnings.push(`Duplicate column heading: ${header}.`)
    seenHeaders.add(header)
    return header
  })
  if (!columns.includes(source.keyColumn))
    throw new Error(`Key column "${source.keyColumn}" was not found.`)
  const rows = matrix.slice(1).map((row) => {
    const values = Object.fromEntries(
      columns.map((column, index) => [column, String(row[index] ?? '')])
    )
    return { key: values[source.keyColumn]!.trim(), values, rowHash: rowHash(values) }
  })
  const filtered = rows.filter((row) => applyFilter(row.values, source))
  const keyCounts = new Map<string, number>()
  for (const row of filtered) keyCounts.set(row.key, (keyCounts.get(row.key) ?? 0) + 1)
  const emptyCount = keyCounts.get('') ?? 0
  if (emptyCount) warnings.push(`${emptyCount} record(s) have an empty key and cannot be printed.`)
  const duplicates = [...keyCounts].filter(([key, count]) => key && count > 1)
  if (duplicates.length)
    warnings.push(
      `Duplicate keys: ${duplicates
        .slice(0, 10)
        .map(([key]) => key)
        .join(', ')}${duplicates.length > 10 ? '…' : ''}.`
    )
  const facts = await stat(path)
  return {
    path,
    columns,
    rows: filtered,
    warnings,
    modifiedAt: facts.mtime.toISOString()
  }
}
