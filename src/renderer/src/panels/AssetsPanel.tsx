/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import type { JSX } from 'react'
import { useDocumentStore } from '../store'
import { importImage } from '../editor/fileActions'
export function AssetsPanel(): JSX.Element {
  const d = useDocumentStore((s) => s.document)
  return (
    <div className="document-properties">
      <button onClick={() => void importImage()}>Import image...</button>
      {d.template.assets.map((a) => (
        <div key={a.id}>
          <img
            alt={a.fileName}
            style={{ maxWidth: 100, maxHeight: 60 }}
            src={`data:${a.mimeType};base64,${d.assetData[a.id]}`}
          />
          <p>{a.fileName}</p>
        </div>
      ))}
    </div>
  )
}
