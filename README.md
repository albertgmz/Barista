# Barista

<p align="center">
  <a href="https://github.com/albertgmz/Barista/actions/workflows/ci.yml"><img src="https://github.com/albertgmz/Barista/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
  <a href="https://github.com/albertgmz/Barista/actions/workflows/release.yml"><img src="https://github.com/albertgmz/Barista/actions/workflows/release.yml/badge.svg" alt="Release status"></a>
  <a href="https://github.com/albertgmz/Barista/releases/latest"><img src="https://img.shields.io/github/v/release/albertgmz/Barista?display_name=tag&label=latest" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--only-blue" alt="GPL-3.0-only license"></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%26%2011-0078D4" alt="Windows 10 and 11">
</p>

<p align="center">
  <img src="src/renderer/src/assets/logo-256.png" width="128" height="128" alt="Barista logo">
</p>

<p align="center"><strong>Design, serialize, and print professional labels on Windows.</strong></p>

<p align="center">
  <a href="https://github.com/albertgmz/Barista/releases/latest"><img src="https://img.shields.io/badge/Download-Installer-0f6cbd?style=for-the-badge&logo=windows&logoColor=white" alt="Download Barista installer"></a>
  <a href="https://github.com/albertgmz/Barista/releases/latest"><img src="https://img.shields.io/badge/Download-Portable-4c8c4a?style=for-the-badge&logo=windows&logoColor=white" alt="Download Barista portable app"></a>
</p>

## Highlights

- Millimetre-precise visual editing for text, images, shapes, barcodes, QR codes, and variables.
- Serialized and data-driven printing from SQLite, MySQL, MariaDB, PostgreSQL, Excel, and CSV.
- Bundled open-source fonts plus portable custom-font embedding when the font license permits it.
- Windows printing, PDF output, print history, reusable templates, and print-station workflows.
- Dark and light workspaces with keyboard commands, snapping, guides, rulers, and preflight checks.
- Consent-based update checks for installed builds; portable builds link to the Releases page.
- Local-only diagnostics with redacted rotating logs and user-reviewed ZIP reports—never telemetry.

## Download and install

Choose **Installer** for automatic in-app updates, Start-menu integration, and the usual Windows
setup experience. Choose **Portable** to run Barista without installation; it opens the Releases
page when a newer version is available. Both downloads are on
[GitHub Releases](https://github.com/albertgmz/Barista/releases/latest). Builds are currently
unsigned, so Windows SmartScreen may ask you to confirm that you trust the download.

Barista supports Windows 10 and 11 (x64), installed Windows printers, common direct-thermal roll
sizes including 2 × 1 and 4 × 6 inches, 60 × 35 mm stock, custom roll sizes, and supported sheet
layouts.

## For developers

Project documentation is indexed in [`docs/`](docs/README.md). Run `npm install`, then `npm run dev`
for development or `build.bat` for the verified Windows build.

Barista contains no telemetry, collects no data, and will always be 100% open source. It is
licensed under the [GNU General Public License v3.0](LICENSE).
