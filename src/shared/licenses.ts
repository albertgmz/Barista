/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */

export interface ThirdPartyLicense {
  id: string
  name: string
  version: string
  license: string
  copyright: string
  licenseText: string
  kind: 'dependency' | 'font'
}
