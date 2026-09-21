# License compatibility audit

Barista source code is licensed under GNU GPLv3 (`GPL-3.0-only`). The full, verbatim license is in
the root [`LICENSE`](../LICENSE) file. This audit covers the locked npm tree and every bundled font;
`npm run licenses:audit` fails when an unreviewed license appears or license metadata is absent.

## Result

- Audited 766 locked dependency packages, including build tools and libraries compiled into the
  renderer bundle.
- Permissive software licenses found: MIT/MIT-0, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause,
  0BSD, Blue Oak 1.0.0, Python-2.0, Zlib combinations, CC0 alternatives, and WTFPL alternatives.
- `caniuse-lite` includes CC-BY-4.0 data. Creative Commons permits one-way adaptation into GPLv3;
  it is a development-time browser-data package and is not executable application code.
- `busboy` and `streamsearch` omit the SPDX field in their package metadata; their installed
  `LICENSE` files contain the MIT license and are checked directly by the audit script.
- Inter, Arimo, Roboto Condensed, JetBrains Mono, and OCR-B are separate font resources under SIL
  OFL 1.1. Each family ships its upstream `OFL.txt`; hashes and sources are in
  [`resources/fonts/README.md`](../resources/fonts/README.md).

No GPLv3 distribution incompatibility was found. `npm run licenses:generate` produces the tracked
catalog in `resources/generated/third-party-licenses.json` from the installed production tree and
the five bundled font families. The catalog currently contains 244 entries and is rendered in the
searchable in-app licenses page; CI fails when the generated file is stale.

The splash uses an illustration supplied by the project owner and credited to Kseniya Lapteva
(`ksushlapush`) under the Pixabay Content License. It is shipped as a separately licensed artwork,
not relicensed as GPL source; provenance and the source checksum are recorded in
`resources/splash/README.md`.
