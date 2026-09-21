# Changelog

All notable changes to Barista are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Semantic Versioning.

## [0.5.0] - 2026-09-20 - "Latte"

### Added

- Object data-source controls, variable-aware canvas previews, brace autocomplete, and a canvas
  context menu for variable binding, arrangement, duplication, deletion, and locking.
- Responsive workspace panels, live preflight notices, expanded editor diagnostics, and safer
  variable creation feedback.

### Changed

- Text boxes reflow while resized; wrap is the default fitting mode, and print/preview use the
  same real-font fitting rules as the editor.
- Barcode configuration now exposes all supported symbologies, per-format validation, colors,
  check digits, GS1 assistance, and variable-resolved previews.
- PDF and PNG exports resolve field-bound barcode values using sample data when no print row is
  available.

### Fixed

- An active inline edit now survives a canvas rebuild.
- Autocomplete, diagnostic-log, and data-source layouts remain usable in compact workspaces.
- Crash-report verification uses isolated application data and cannot add synthetic events to an
  operator's diagnostic log.

## [0.4.0] - 2026-09-20 - "Espresso"

### Added

- Millimetre-precise label editing with text, images, shapes, barcodes, guides, snapping, variables,
  serialized records, preflight, print preview, Windows printing, PDF export, and print history.
- Version-2 `.bar` archives with checksummed assets, previews, recovery, and custom-font embedding.
- Bundled OFL fonts for UI, canvas, PDF, and print output, plus a custom-font manager.
- Drizzle-backed repository implementations for SQLite, MySQL, MariaDB, and PostgreSQL with atomic
  serial reservation and migration backups.
- Excel and CSV data sources, integration server, print-station mode, reusable templates, and
  database-backed printer profiles.
- Fluent UI dark/light workspace, keyboard command system, persistent panel layout, and startup
  splash with real readiness progress.
- Consent-based GitHub Release updates with installed/portable safeguards and update preferences.
- A searchable in-app catalog containing full notices for production dependencies and bundled
  fonts, plus release/build metadata in About.
- Original full-bleed splash artwork and branded NSIS installer/uninstaller screens.
- Local-only rotating diagnostics, crash reports, a searchable log viewer, and manually reviewed
  support ZIPs with write-time secret redaction and no upload path.
- Multiline text editing with bundled-font controls, bold/italic styles, alignment, arbitrary hex
  colors, fit modes, and variable insertion.
- An optional “Keep inside label” control that constrains object geometry to the printable stock.
- Hovering a text, barcode or QR object reveals the `{variable}` expression behind its value, and a
  variable chip in Properties shows the value it stands for.

### Changed

- Barista is now distributed under GNU GPLv3 as the first public source release.
- The design canvas resolves variables to their values by default; View → Show Sample Data turns the
  raw expressions back on, and inline editing always edits the expression.
- Version 2 is the only supported `.bar` document version.
- All UI and document rendering resolves fonts from bundled or explicitly imported resources.
- The Windows build launcher now resolves Node.js and npm by absolute path, including on machines
  with malformed legacy PATH entries.

### Security

- Renderer sandboxing, context isolation, validated IPC, encrypted database passwords, strict CSP,
  path allowlists, bounded parsers, and repository-wide security verification are enabled.

### Distribution

- Windows installer and portable builds are unsigned. Windows SmartScreen may display a warning;
  verify the published SHA-256 checksum before running a downloaded artifact.

[0.4.0]: https://github.com/albertgmz/Barista/releases/tag/v0.4.0
[0.5.0]: https://github.com/albertgmz/Barista/releases/tag/v0.5.0
