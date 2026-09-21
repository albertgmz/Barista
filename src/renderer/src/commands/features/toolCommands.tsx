/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import {
  BarcodeScanner24Regular,
  Cursor24Regular,
  Image24Regular,
  Line24Regular,
  Pen24Regular,
  QrCode24Regular,
  RectangleLandscape24Regular,
  TextT24Regular,
  Circle24Regular
} from '@fluentui/react-icons'
import { useDocumentStore, useEditorStore } from '../../store'
import type { ToolId } from '../../store'
import type { CommandRegistry } from '../registry'
import type { ReactElement } from 'react'

export const TOOL_GROUPS: readonly (readonly ToolId[])[] = [
  ['select'],
  ['text'],
  ['barcode', 'qrcode'],
  ['image'],
  ['rect', 'ellipse', 'line'],
  ['pen']
]

export function registerToolCommands(registry: CommandRegistry): void {
  const tools: [ToolId, string, ReactElement, string][] = [
    ['select', 'Select', <Cursor24Regular />, 'v'],
    ['text', 'Text', <TextT24Regular />, 't'],
    ['barcode', 'Barcode', <BarcodeScanner24Regular />, 'b'],
    ['qrcode', 'QR Code', <QrCode24Regular />, 'q'],
    ['image', 'Image', <Image24Regular />, 'i'],
    ['rect', 'Rectangle', <RectangleLandscape24Regular />, 'u'],
    ['ellipse', 'Ellipse', <Circle24Regular />, 'e'],
    ['line', 'Line', <Line24Regular />, 'l'],
    ['pen', 'Pen', <Pen24Regular />, 'p']
  ]
  for (const [tool, label, icon, key] of tools) {
    registry.register({
      id: `tool.${tool}`,
      label,
      icon,
      isEnabled: () => tool === 'select' || !useDocumentStore.getState().fileReadOnly,
      isChecked: () => useEditorStore.getState().activeTool === tool,
      shortcut: { display: key.toUpperCase(), binding: { key } },
      run: () => useEditorStore.getState().setActiveTool(tool)
    })
  }
}
