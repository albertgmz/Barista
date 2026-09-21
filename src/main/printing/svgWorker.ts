/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { utilityProcess } from 'electron'
import { join } from 'node:path'
import type { LabelDocument } from '@shared/template/types'
import type { PrintSettings } from '@shared/printSettings'
import type { EvaluationContext } from '@shared/variables'

interface Response {
  id: number
  svg?: string
  error?: string
}
let worker: Electron.UtilityProcess | null = null
let sequence = 0
const pending = new Map<
  number,
  {
    resolve: (svg: string) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()

function processWorker(): Electron.UtilityProcess {
  if (worker) return worker
  const child = utilityProcess.fork(join(__dirname, 'renderWorker.js'), [], {
    serviceName: 'Barista label renderer'
  })
  child.on('message', (message: Response) => {
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error))
    else request.resolve(message.svg ?? '')
  })
  child.on('exit', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('Label render worker stopped.'))
    }
    pending.clear()
    worker = null
  })
  worker = child
  return child
}

export function renderSvgInUtility(
  document: LabelDocument,
  settings: PrintSettings,
  context: EvaluationContext = {}
): Promise<string> {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Label rendering timed out.'))
    }, 30000)
    pending.set(id, { resolve, reject, timer })
    processWorker().postMessage({ id, document, settings, context })
  })
}

export function disposeRenderWorker(): void {
  worker?.kill()
  worker = null
}
