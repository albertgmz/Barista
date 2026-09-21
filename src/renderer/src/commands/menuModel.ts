/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
export type MenuEntry = string | { label: string; items: MenuEntry[] }
export const MENUS: { label: string; mnemonic: string; items: MenuEntry[] }[] = [
  {
    label: 'File',
    mnemonic: 'f',
    items: [
      'file.new',
      'file.open',
      { label: 'Open Recent', items: ['file.recentEmpty'] },
      '-',
      'file.save',
      'file.saveAs',
      'file.revert',
      'file.close',
      { label: 'Export', items: ['file.exportPdf', 'file.exportPng'] },
      '-',
      'file.labelSetup',
      'file.dataSources',
      'file.print',
      '-',
      'file.exit'
    ]
  },
  {
    label: 'Edit',
    mnemonic: 'e',
    items: [
      'edit.undo',
      'edit.redo',
      '-',
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.pasteInPlace',
      'edit.duplicate',
      'edit.delete',
      '-',
      'edit.selectAll',
      'edit.deselect',
      '-',
      'edit.preferences'
    ]
  },
  {
    label: 'Object',
    mnemonic: 'o',
    items: [
      {
        label: 'Arrange',
        items: ['object.front', 'object.forward', 'object.backward', 'object.back']
      },
      {
        label: 'Align',
        items: [
          'object.alignLeft',
          'object.alignCenter',
          'object.alignRight',
          '-',
          'object.alignTop',
          'object.alignMiddle',
          'object.alignBottom'
        ]
      },
      {
        label: 'Distribute',
        items: ['object.distributeHorizontal', 'object.distributeVertical']
      },
      '-',
      'object.group',
      'object.ungroup',
      '-',
      'object.lock',
      'object.unlock',
      'object.hide',
      '-',
      'object.bindVariable',
      'object.makeVariableSelection',
      '-',
      'object.lockAll',
      'object.unlockAll',
      'object.hideAll',
      'object.showAll'
    ]
  },
  {
    label: 'View',
    mnemonic: 'v',
    items: [
      'view.zoomIn',
      'view.zoomOut',
      'view.zoomFit',
      'view.zoomSelection',
      'view.actualSize',
      '-',
      'view.grid',
      'view.rulers',
      'view.snap',
      'view.sampleData',
      'view.lockGuides',
      'view.clearGuides',
      '-',
      { label: 'Theme', items: ['theme.system', 'theme.light', 'theme.dark'] }
    ]
  },
  {
    label: 'Window',
    mnemonic: 'w',
    items: [
      'window.tools',
      'window.options',
      '-',
      'window.properties',
      'window.layers',
      'window.variables',
      'window.assets',
      'window.preflight',
      '-',
      { label: 'Workspace', items: ['workspace.reset'] },
      'window.printHistory',
      '-',
      'window.minimize',
      'window.maximize',
      'window.close'
    ]
  },
  {
    label: 'Help',
    mnemonic: 'h',
    items: ['help.viewLogs', 'help.createDiagnosticReport', '-', 'help.about']
  }
]
export const CANVAS_MENU: MenuEntry[] = [
  'edit.duplicate',
  'edit.delete',
  '-',
  'object.bindVariable',
  'object.dataSource',
  '-',
  'object.front',
  'object.back',
  'object.lock',
  '-',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.pasteInPlace'
]
export const TOOLS_MENU: MenuEntry[] = [
  'tools.columns',
  '-',
  'tools.left',
  'tools.right',
  'tools.floating',
  '-',
  'window.tools'
]
export const LAYER_MENU: MenuEntry[] = [
  'edit.cut',
  'edit.copy',
  'edit.duplicate',
  'edit.delete',
  '-',
  MENUS[2]!.items[0]!,
  MENUS[2]!.items[1]!,
  MENUS[2]!.items[2]!,
  '-',
  'object.group',
  'object.ungroup',
  'object.lock',
  'object.unlock',
  'object.hide',
  '-',
  'object.bindVariable',
  'object.makeVariableSelection'
]
