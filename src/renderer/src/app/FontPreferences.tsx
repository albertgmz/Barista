/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { JSX } from 'react'
import { Button, MessageBar, MessageBarBody } from '@fluentui/react-components'
import { useFontStore } from '../store/fontStore'

const embeddingLabel = {
  installable: 'May be embedded',
  editable: 'May be embedded in editable labels',
  'preview-print': 'Reference only — preview/print embedding cannot be used in editable labels',
  restricted: 'Reference only — embedding is restricted',
  'bitmap-only': 'Reference only — outline embedding is not permitted'
} as const

export function FontPreferences(): JSX.Element {
  const catalog = useFontStore((state) => state.catalog)
  const loading = useFontStore((state) => state.loading)
  const error = useFontStore((state) => state.error)

  const importFont = async (): Promise<void> => {
    const result = await window.barista.invoke('fonts:import')
    if (!result.ok) {
      window.alert(result.error.message)
      return
    }
    if (result.value) await useFontStore.getState().refresh()
  }

  const removeFont = async (id: string): Promise<void> => {
    const result = await window.barista.invoke('fonts:remove', { id })
    if (!result.ok) window.alert(result.error.message)
    else await useFontStore.getState().refresh()
  }

  return (
    <section aria-label="Fonts">
      <p>
        Barista uses only these bundled and imported fonts. Imported files are stored in your user
        data folder and are never installed system-wide.
      </p>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <Button appearance="primary" disabled={loading} onClick={() => void importFont()}>
        Import font…
      </Button>
      <div className="font-list">
        {catalog.families.map((font) => (
          <article key={`${font.source}-${font.id}`} className="font-list-item">
            <strong style={{ fontFamily: font.family }}>{font.family}</strong>
            <span>
              {font.source === 'bundled'
                ? 'Bundled'
                : font.source === 'custom'
                  ? 'Custom'
                  : 'Embedded'}
              {' · '}
              {font.license}
            </span>
            <small>{font.copyright}</small>
            {font.faces.map((face) => (
              <small key={face.id}>
                {face.style}, weight {face.weight} · {embeddingLabel[face.embedding]}
                {face.noSubsetting ? ' · subsetting prohibited' : ''}
              </small>
            ))}
            {font.source === 'custom' && (
              <Button appearance="subtle" onClick={() => void removeFont(font.id)}>
                Remove
              </Button>
            )}
          </article>
        ))}
      </div>
      <p>
        Script coverage: Inter includes Latin, Greek, and Cyrillic. CJK fonts are not bundled
        because the additional font data would materially increase the installer; import a licensed
        CJK font when needed.
      </p>
    </section>
  )
}
