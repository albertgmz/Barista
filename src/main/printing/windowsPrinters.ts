/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { pxToMm } from '@shared/units'
const factsSchema = z.array(
  z.object({
    name: z.string(),
    isDefault: z.boolean(),
    offline: z.boolean(),
    status: z.number(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    margin: z.number().nullable()
  })
)
export async function windowsPrinterFacts(): Promise<
  Map<
    string,
    {
      isDefault: boolean
      status: string
      paperWidthMm?: number
      paperHeightMm?: number
      marginMm?: number
    }
  >
> {
  if (process.platform !== 'win32') return new Map()
  const script = `Add-Type -AssemblyName System.Printing; $server=New-Object System.Printing.LocalPrintServer; $facts=@(Get-CimInstance Win32_Printer); @($server.GetPrintQueues() | ForEach-Object { $q=$_; $p=$facts | Where-Object Name -eq $q.Name | Select-Object -First 1; $ticket=$q.DefaultPrintTicket; $caps=$q.GetPrintCapabilities($ticket); [PSCustomObject]@{name=$q.Name;isDefault=[bool]$p.Default;offline=[bool]$p.WorkOffline;status=[int]$p.PrinterStatus;width=$ticket.PageMediaSize.Width;height=$ticket.PageMediaSize.Height;margin=$caps.PageImageableArea.OriginWidth} }) | ConvertTo-Json -Compress`
  try {
    const { stdout } = await promisify(execFile)(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 2_000_000 }
    )
    const parsed: unknown = JSON.parse(stdout),
      facts = factsSchema.parse(Array.isArray(parsed) ? parsed : [parsed])
    return new Map(
      facts.map((p) => [
        p.name,
        {
          isDefault: p.isDefault,
          status: p.offline ? 'Offline' : p.status === 3 ? 'Ready' : `Status ${p.status}`,
          paperWidthMm: p.width ? pxToMm(p.width, 96) : undefined,
          paperHeightMm: p.height ? pxToMm(p.height, 96) : undefined,
          marginMm: p.margin !== null ? pxToMm(p.margin, 96) : undefined
        }
      ])
    )
  } catch {
    return new Map()
  }
}
