/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { useEffect } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useFontStore } from '../store/fontStore'

export function useFonts(): void {
  const fonts = useDocumentStore((state) => state.document.template.fonts)
  const fontData = useDocumentStore((state) => state.document.fontData)
  useEffect(() => {
    void useFontStore.getState().refresh()
  }, [])
  useEffect(() => {
    void useFontStore.getState().loadEmbedded(fonts, fontData)
  }, [fontData, fonts])
}
