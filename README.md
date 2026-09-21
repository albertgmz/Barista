# Barista

<p align="center">
  <a href="https://github.com/albertgmz/Barista/actions/workflows/ci.yml"><img src="https://github.com/albertgmz/Barista/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
  <a href="https://github.com/albertgmz/Barista/actions/workflows/release.yml"><img src="https://github.com/albertgmz/Barista/actions/workflows/release.yml/badge.svg" alt="Release status"></a>
</p>

<p align="center">
  <img src="src/renderer/src/assets/logo-256.png" width="128" height="128" alt="Barista logo">
</p>

<p align="center"><strong>Design, serialize, and print professional labels on Windows.</strong></p>

## Highlights

- Millimetre-precise visual editing for text, images, shapes, barcodes, QR codes, and variables.
- Serialized and data-driven printing from SQLite, MySQL, MariaDB, PostgreSQL, Excel, and CSV.
- Bundled open-source fonts plus portable custom-font embedding when the font license permits it.
- Windows printing, PDF output, print history, reusable templates, and print-station workflows.
- Dark and light workspaces with keyboard commands, snapping, guides, rulers, and preflight checks.
- Consent-based update checks for installed builds; portable builds link to the Releases page.
- Local-only diagnostics with redacted rotating logs and user-reviewed ZIP reports—never telemetry.

## Download and install

Download the installer or portable executable from
[GitHub Releases](https://github.com/albertgmz/Barista/releases). Builds are currently unsigned, so
Windows SmartScreen may ask you to confirm that you trust the download.

Barista supports Windows 10 and 11 (x64), installed Windows printers, common direct-thermal roll
sizes including 2 × 1 and 4 × 6 inches, 60 × 35 mm stock, custom roll sizes, and supported sheet
layouts.

Project documentation is indexed in [`docs/`](docs/README.md). Developers can run `build.bat` for
the verified Windows build.

Barista contains no telemetry, collects no data, and will always be 100% open source. It is
licensed under the [GNU General Public License v3.0](LICENSE).
