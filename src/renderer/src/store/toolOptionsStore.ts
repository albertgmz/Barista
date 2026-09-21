/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { create } from 'zustand'

interface ToolOptions {
  font: string
  size: number
  bold: boolean
  italic: boolean
  color: string
  alignment: string
  strokeWidth: number
  fill: string
}
interface OptionsState {
  options: ToolOptions
  update: (patch: Partial<ToolOptions>) => void
}
export const useToolOptionsStore = create<OptionsState>((set) => ({
  options: {
    font: 'Inter',
    size: 12,
    bold: false,
    italic: false,
    color: '#000000',
    alignment: 'Left',
    strokeWidth: 0.3,
    fill: '#ffffff'
  },
  update: (patch) => set((state) => ({ options: { ...state.options, ...patch } }))
}))
