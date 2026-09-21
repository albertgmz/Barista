/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { strToU8, unzipSync, zipSync } from 'fflate'
import * as XLSX from 'xlsx'
import type { DataSourceDefinition } from '@shared/template/types'
import { excelTables, inspectWorkbook, readDataSource } from './workbook'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function folder(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'barista-workbook-'))
  temporary.push(path)
  return path
}

function workbookBytes(bookType: 'xlsx' | 'xls' = 'xlsx'): Uint8Array {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Asset', 'Name', 'Area'],
    ['EQ-1', 'Pump', 'North'],
    ['EQ-2', 'Compressor', 'South'],
    ['', 'Missing key', 'North'],
    ['EQ-2', 'Duplicate key', 'North']
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Equipment')
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType }) as ArrayBuffer)
}

function source(
  path: string,
  selection: DataSourceDefinition['selection'] = { kind: 'sheet', name: 'Equipment' }
): DataSourceDefinition {
  return {
    id: 'equipment-source',
    name: 'Equipment',
    path,
    selection,
    headerRow: 1,
    keyColumn: 'Asset',
    filter: null,
    mappings: [{ column: 'Name', variable: 'name' }],
    writeStatusColumn: false
  }
}

function withTable(bytes: Uint8Array): Uint8Array {
  const entries = unzipSync(bytes)
  entries['xl/worksheets/_rels/sheet1.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>'
  )
  entries['xl/tables/table1.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="EquipmentTable" displayName="EquipmentTable" ref="A1:C3" totalsRowShown="0"><autoFilter ref="A1:C3"/><tableColumns count="3"><tableColumn id="1" name="Asset"/><tableColumn id="2" name="Name"/><tableColumn id="3" name="Area"/></tableColumns></table>'
  )
  return zipSync(entries)
}

describe('spreadsheet data sources', () => {
  it('rejects an XLSX entry with a suspicious expansion ratio', async () => {
    const root = await folder(),
      path = join(root, 'bomb.xlsx'),
      bytes = zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(2_000_000) }, { level: 9 })
    await writeFile(path, bytes)
    await expect(inspectWorkbook(path)).rejects.toThrow('safe processing limit')
  })
  it('reads xlsx rows, filters values and warns about invalid keys', async () => {
    const root = await folder()
    const path = join(root, 'equipment.xlsx')
    await writeFile(path, workbookBytes())
    const definition = source('equipment.xlsx')
    definition.filter = { column: 'Area', operator: 'equals', value: 'North' }
    const result = await readDataSource(definition, join(root, 'label.bar'))
    expect(result.rows.map((row) => row.key)).toEqual(['EQ-1', '', 'EQ-2'])
    expect(result.warnings).toContain('1 record(s) have an empty key and cannot be printed.')
    expect(result.rows[0]!.rowHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('reads legacy xls and csv files', async () => {
    const root = await folder()
    const xls = join(root, 'equipment.xls')
    const csv = join(root, 'equipment.csv')
    await writeFile(xls, workbookBytes('xls'))
    await writeFile(csv, 'Asset,Name\nEQ-9,Press\n')
    await expect(readDataSource(source(xls), null)).resolves.toMatchObject({
      columns: ['Asset', 'Name', 'Area']
    })
    const csvSource = source(csv, { kind: 'sheet', name: 'Sheet1' })
    await expect(readDataSource(csvSource, null)).resolves.toMatchObject({
      columns: ['Asset', 'Name'],
      rows: [{ key: 'EQ-9' }]
    })
  })

  it('discovers and limits reads to a named Excel table', async () => {
    const root = await folder()
    const bytes = withTable(workbookBytes())
    const path = join(root, 'table.xlsx')
    await writeFile(path, bytes)
    expect(excelTables(bytes)).toEqual([
      { name: 'EquipmentTable', sheet: 'Equipment', range: 'A1:C3', headerRow: 1 }
    ])
    await expect(inspectWorkbook(path)).resolves.toMatchObject({
      sheets: ['Equipment'],
      tables: [{ name: 'EquipmentTable' }]
    })
    const result = await readDataSource(
      source(path, { kind: 'table', name: 'EquipmentTable' }),
      null
    )
    expect(result.rows.map((row) => row.key)).toEqual(['EQ-1', 'EQ-2'])
  })

  it('produces the same hash for the same row content', async () => {
    const root = await folder()
    const path = join(root, 'equipment.xlsx')
    const bytes = workbookBytes()
    await writeFile(path, bytes)
    const first = await readDataSource(source(path), null)
    const second = await readDataSource(source(path), null)
    expect(first.rows[0]!.rowHash).toBe(second.rows[0]!.rowHash)
    expect(bytes.length).toBeGreaterThan(0)
  })
})
