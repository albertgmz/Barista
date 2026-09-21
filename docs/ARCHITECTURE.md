# Architecture

Barista 0.3.0 is an Electron desktop application for designing and printing industrial labels.
This document describes the shipped process boundaries, persistence, document format, rendering,
quality, integration and Windows-printing architecture.

## Process model

Electron runs three kinds of code, and this project keeps them strictly separated.

```
┌──────────────────────────┐      ┌──────────────────────────┐
│   Main process (Node)    │      │  Renderer (Chromium)     │
│                          │      │                          │
│  windows, splash         │◀────▶│  React + Fluent UI v9    │
│  printing, file I/O      │ IPC  │  Fabric canvas, dockview │
│  settings, counters      │      │  Zustand stores          │
└────────────┬─────────────┘      └────────────▲─────────────┘
             │                                 │
             │  ┌──────────────────────┐       │
             ├─▶│ Utility process      │       │
             │  │ barcode/QR SVG work  │       │
             │  └──────────────────────┘       │
             │        ┌────────────────────────┴──┐
             └───────▶│  Preload (context bridge) │
                      │  allowlisted, sandboxed   │
                      └───────────────────────────┘
```

**Main** is the only process with operating-system access. It owns the windows and splash,
the print spooler, the file system and the settings store.

**Renderer** is an ordinary React application with no Node access at all. It cannot read a file or
reach a printer; it asks the main process to.

**Preload** is the narrow bridge between them. It runs sandboxed, may only `require('electron')`,
and exposes `invoke`, `on` and allowlisted `send` on `window.barista`. The splash has
its own restricted bridge exposing only `ready` and `onStatus`.

### Security posture

| Setting            | Value   | Consequence                                               |
| ------------------ | ------- | --------------------------------------------------------- |
| `contextIsolation` | `true`  | Preload and page scripts get separate JavaScript contexts |
| `sandbox`          | `true`  | The renderer process runs in the OS sandbox               |
| `nodeIntegration`  | `false` | No `require` or Node globals in the page                  |

Three further rules are enforced in `src/main/index.ts`: popups are denied via
`setWindowOpenHandler`, navigation away from the app origin is blocked on `will-navigate`, and all
permission requests are denied. In packaged builds the reload and devtools keys are swallowed.

Because sandboxed preload scripts cannot be ES modules, the build emits CommonJS — this is why
`package.json` deliberately has no `"type": "module"`.

The renderer's Content Security Policy is a `<meta>` tag in `src/renderer/index.html`. It lives
there rather than in a `webRequest` header because a packaged app loads the renderer over `file://`,
for which Electron does not run `onHeadersReceived`. `electron.vite.config.ts` rewrites that tag
with a relaxed policy when serving the dev server, which needs an inline script for React Refresh
and a websocket for HMR. The packaged policy allows no inline scripts.

## Folder responsibilities

```
src/
  main/                  Electron main process
    index.ts             App lifecycle, single-instance lock, security hardening
    windows/             Window creation, Mica backdrop, title-bar overlay, state persistence
    ipc/                 IPC handlers, one file per domain, registered from index.ts
    printing/            PrinterAdapter implementations and the print queue
    serial/              Counter/serial number service
    server/              Future localhost print API
    storage/             User-data paths, settings store, template file I/O
  preload/
    index.ts             The contextBridge API, built from the shared contract
  renderer/
    index.html           Entry document; carries the production CSP
    src/
      app/               Root component, theme bridge, layout, title bar and menubar
      commands/          Registry, feature registrations, menus and shortcuts
      workspace/         Restore, persistence and readiness
      splash/            Minimal startup view (no React dependency)
      editor/            Toolbar and the Fabric.js design canvas with rulers and grid
      panels/            Dockview host plus the Properties/Layers/Variables/Assets panels
      print/             The print dialog
      components/        Small shared UI building blocks
      store/             Zustand stores: document, editor, ui
  shared/                Imported by all three processes
    ipc/contract.ts      The typed IPC contract
    format/              The versioned .bar manifest, schema and migration pipeline
    template/            Label document type definitions and runtime guards
    render/              The LabelRenderer interface and its four back ends
    errors.ts            NotImplementedError, thrown by every stub
    units.ts             Millimetre / pixel / point conversions
```

`src/shared/` is compiled into both TypeScript projects, which means it may rely on neither
environment's globals: the main-process project has no DOM library, and the web project has no Node
library. Where an abstraction genuinely needs something from one side, it declares its own local
shape — see `CanvasRenderTarget` in `src/shared/render/types.ts`, which stands in for a canvas
element, and `Platform` in `src/shared/ipc/contract.ts`, which stands in for `NodeJS.Platform`.

## The IPC contract

`src/shared/ipc/contract.ts` is the single source of truth. Adding a message means editing that
file first; everything else derives from it.

- `IpcInvokeMap` maps each request/response channel to its request and response types. The main
  process registers handlers against it, so a handler returning the wrong shape fails to compile.
- `IpcEventMap` maps main-to-renderer pushes: `theme:changed`, `splash:status` and
  `workspace:flush`. `IpcSendMap` describes renderer notifications: `app:ready`,
  `splash:ready` and `workspace:flushed`.
- `IPC_INVOKE_CHANNELS` and `IPC_EVENT_CHANNELS` are the runtime allowlists the preload bridge
  checks. They are derived from an object declared `satisfies Record<IpcInvokeChannel, true>`, which
  is exhaustive in both directions: a channel added to the map but forgotten in the allowlist, or an
  allowlist entry with no channel, is a compile error. (A `satisfies readonly Channel[]` on an array
  would only check each element, and would silently miss the omission — the direction that matters,
  since a forgotten channel ships and is then blocked at runtime.)
- `BaristaApi` is the entire renderer-visible surface: `invoke(channel, request)` and
  `on(channel, listener)` and `send(channel)`. Subscriptions return an unsubscribe function.

### The result envelope

Fallible channels return `IpcResult<T>`, which is `{ ok: true, value }` or
`{ ok: false, error: { code, message } }`, rather than rejecting. A thrown error crosses the IPC
boundary as an opaque string, which would lose the error code the renderer needs in order to react.
Construct results with the `ok()`, `fail()` and `notImplemented()` helpers.

Every stubbed channel today returns `notImplemented()`, and the renderer is written to display that
gracefully rather than log an error.

### Command registry and keyboard flow

`renderer/src/commands/registry.ts` defines `Command`: id, label, optional icon,
optional shortcut (display text and binding), `isEnabled`, optional `isChecked`,
and `run`. Feature modules register document, workspace and tool commands in
`CommandProvider`. Duplicate ids and bindings fail immediately. Execution
rechecks enabled state and reports failures through a toast. Document and object
operations execute document actions; selection-dependent operations are disabled when empty.

Menu models contain command ids and submenu structure. Title menus, canvas and
docking context menus, tool flyouts and buttons resolve the same registry.
Fluent renders disabled items, separators, checkmarks and shortcuts. Checked
values live on Menu; checkbox actions dismiss the menu. `MenuBar` adds roving
focus, Alt focus, Alt+F/E/O/V/W/H, horizontal navigation and hover switching.
Fluent handles item navigation, submenus and Escape. Caption space is reserved
for native overlay buttons; interactive areas are non-draggable.

The registry now owns the full File/Edit/Object/View/Window/Help surface, tool palette and canvas,
object and Layers context menus. State policies disable mutations for read-only future documents,
locked selections and invalid selection counts. Clipboard copy writes standard text/image formats
plus a private ownership token; paste recreates internal objects when that token is present and
creates text or image objects from other Windows applications otherwise. The complete surface and
state rules are enforced by the command registry tests.

### Preferences

`shared/settings.ts` defines and validates the additive `AppSettings` contract. The main-process
store reads `settings.json` below user data, falls back to dark-theme defaults on missing/corrupt
input and replaces the file atomically. Preferences cover units, small/large nudge distance, grid
spacing/subdivisions, individual snap targets, default stock/DPI, autosave interval, theme, default
printer and calibrated screen DPI. The renderer applies them to new documents, editing gestures,
the canvas, theme and recovery cadence.

**Native menu decision:** `Menu.setApplicationMenu(null)`. No native
accelerators or `menu:command` channel remain. One renderer keydown dispatcher
matches registry bindings, preventing duplicate execution. It ignores inputs,
textareas, selects, editable content, IME, AltGr, repeats and modal/menu
interactions. Chromium retains standard text editing inside inputs. Ctrl+wheel
retains the existing canvas zoom behavior.

FluentProvider sets `applyStylesToPortals={false}`. Portals inherit theme tokens,
not the application's full-window height and opaque background, which would
otherwise let tooltip containers cover the workspace.

### Workspace state and persistence

`shared/workspace.ts` defines the version-1 envelope saved to `workspace.json`
under `userDataPaths().root`:

```json
{
  "version": 1,
  "dockview": null,
  "tools": { "placement": "left", "x": 80, "y": 40, "columns": 1, "visible": true },
  "optionsBarVisible": true,
  "panels": { "properties": true, "layers": true, "variables": true, "assets": true },
  "keepObjectsInsideLabel": false
}
```

`dockview` is null for defaults or the full `api.toJSON()` object. Tool positions
are CSS pixels relative to the workspace; label geometry stays in millimetres.
The palette has independent placement state so a future separate-window host
can reuse its contents. ResizeObserver clamps it to the workspace. Drag within
48 pixels of either edge to dock. The grip also supports arrow-key movement,
Ctrl+Left/Right docking and a docking context menu. Grouped variants open on
right-click, long-press or the arrow keys. Tool defaults use a separate
Zustand store; the options bar edits selected document objects when a selection exists. Tool options, theme and
view/grid preferences remain session state, outside the layout envelope. Keep inside
label is the exception: the editor store still holds the live flag that
`documentStore.change` reads, and the envelope only carries it between sessions.
Keys added after version 1 shipped are optional in `isWorkspaceLayout`, so a file
written by an earlier build still restores instead of falling back to defaults.

Typed `workspace:read`/`workspace:write` return `IpcResult`. Main validates saved
and received data, limits files to 256 KiB, and rejects unknown versions,
invalid coordinates, foreign components, duplicate/dangling view references and
dockview floating/popout groups. The tools palette handles in-window floating;
OS popouts are disabled. Missing/malformed files use defaults; I/O failures show
a status message. The dock host also catches `fromJSON` failures and resets.

Restore finishes before dockview mounts and persistence begins. Layout and
visibility changes update Zustand and a 250 ms debounce writes a snapshot.
Main serializes writes and atomically renames a temporary file. Closing asks
for `workspace:flush`; the renderer drains the debounce, awaits the write and
sends `workspace:flushed`. Main drains queued writes before closing, with a
one-second escape for crashed renderers. Reset replaces the full envelope and
remounts dockview. Generation checks reject events from the old dock host.
No localStorage is used.

### Startup: splash to main window

1. Acquire the single-instance lock and register security handlers and IPC.
2. Create the centered 820 x 520 frameless splash before the main BrowserWindow. Its full-bleed
   original SVG artwork, rounded corners, startup status and progress remain isolated from React.
   Its minimal HTML/TypeScript entry and restricted CommonJS preload retain
   sandboxing, context isolation, no Node integration and the production CSP.
   System theme, CSS rounded corners and shadow also work without Mica.
3. `splash:ready` requests the current status and `app.getVersion()`. Main runs real preflight
   reads in sequence: preferences, bundled and user-imported fonts, Windows printers, autosave
   recovery and the saved workspace. A failed preflight is logged and the owning renderer/service
   still performs its normal fallback; progress never depends on a simulated timer.
4. Create the main window hidden. On `did-finish-load`, request a hidden
   `capturePage` with `stayHidden`/`stayAwake` to initiate a compositor frame.
   Electron 44 overlay windows otherwise defer hidden paints. Capture is best
   effort: some Windows compositors report UnknownVizError after delivering the
   frame. This never reveals the window or bypasses renderer readiness.
5. After workspace restore and two animation frames, the renderer sends
   `app:ready`. Only the main window's main frame is accepted. Reveal the saved
   normal/maximized window after readiness and the minimum duration, then fade
   the splash over approximately 180 ms.
6. Minimum duration is 1500 ms. `BARISTA_SPLASH_MIN_MS` accepts 0-10000 ms for
   testing/demo use. At 15 seconds, reveal anyway and log to stderr and
   `userData/logs/startup.log`. No visibility code relies on `ready-to-show`.

Second launches focus the splash during startup and the main window afterward,
without revealing the main window early. Closing windows cleans up timers and
IPC listeners. The Mica 22621 gate and Windows 10 opaque fallback remain intact.

## The template format

A `.bar` file is a deterministic ZIP archive:

```
manifest.json     Format/app versions, timestamps and content hashes
label.json        A serialized LabelTemplate
preview.png       A checksummed thumbnail generated from the saved design
assets/           Content-addressed binary assets referenced by the manifest
```

The formal manifest schema and migrations are in `src/shared/format/`; label types and validation
are in `src/shared/template/`. Stable JSON key ordering, fixed ZIP timestamps and sorted asset paths
make equivalent archives byte-for-byte deterministic. Asset payloads are keyed by SHA-256, so
identical bytes are stored once. Version 2 is the oldest supported format. Older archives fail with
a compatibility message rather than being partially decoded; compatible future versions open
read-only with a warning. The migration pipeline remains available for a future v2-to-v3 change.

Saves write a temporary sibling and rename it over the destination, retaining the previous file as
`<name>.bar.bak`. Dirty documents are periodically copied to the recovery area under user data; the
next startup offers recovery before opening command-line files. Key points:

- **Every position and size is in millimetres**, with the origin at the label's top-left corner and
  the y-axis pointing down. Font sizes (points) and rotation (degrees) are the only exceptions.
  Conversions go through `src/shared/units.ts` — never inline the arithmetic.
- **`LabelTemplate`** carries a schema `version`, physical `stock`, a `design`, variables, assets and
  metadata. Stock records dimensions, DPI, shape, safe margin, gap and roll/sheet geometry. Design
  owns the ordered objects and guides. Metadata owns title, description, author, tags, revision and
  draft/approved status.
- **Variables** are a discriminated union on `kind`: `fixed`, `prompt` (asked for at print time),
  `counter` (a serial with step, padding and affixes, scoped per template or by a shared name),
  `datetime`, `field` (a mapped data-source column) and `formula`.
- **Objects** are a discriminated union on `kind`: `text`, `barcode`, `qrcode`, `image`, `path`,
  `rect` and `line`. Text and barcode data are _expressions_ — `{equipo}{serial}` interpolates the
  variables of those names — not literal strings.
- **Text fitting** is stored as `none`, `shrink`, `fit-width` or `wrap`, plus a minimum point size
  and maximum line count. `src/shared/textFit.ts` supplies deterministic fitted lines, effective
  size and overflow state to both Fabric preview and SVG print/export. The editor outlines overflow
  in red and reports when the configured minimum has been reached. Fitting never drops a line:
  `maxLines` constrains `shrink` alone, where it decides how far the point size has to fall, while
  `wrap` keeps every line and reports overflow once they outgrow the box. Vertical placement comes
  from `verticalOffset` in the same module, so the canvas textbox and the print SVG anchor a
  block of lines identically.
- **Text measurement is injectable, because only a renderer can measure a font.** `fitText` and
  `estimatedTextWidthMm` take an optional `TextMeasurer` — `(text, fontSizePt, font)` — and fall
  back to a glyph-class approximation that ignores the family, weight and style, since
  `src/shared/` has no canvas. The renderer injects `editor/textMeasure.ts`, a memoised Canvas 2D
  `measureText` keyed on family, weight, style and size, at the canvas, the Properties panel and
  preflight, so the editor wraps where it draws. The print SVG is built in a utility process that
  has no canvas either, so `shared/render/svg.ts` carries the source text, the box and the vertical
  anchor as `data-*` attributes and `main/printing/renderWindow.ts` re-wraps the wrapping modes in
  the print window with the same `measureText` before the PDF, PNG or native bitmap is taken. Only
  the line breaks come from real metrics there. The point size does not: `shrink` and `fit-width`
  choose theirs before the print window exists, so those two modes can print at a slightly
  different size from the one the editor shows, while `wrap` and `none` keep the authored size on
  both sides. Preflight is injected everywhere a renderer computes it, so the panel, the toast,
  the print dialog and Print Station all agree; `main/ipc/printIpc.ts` and `main/server/printApi.ts`
  keep the approximation, because a main-process gate has no canvas to measure with.
- **The `fitMode` default differs by origin, deliberately.** `createObject` gives a new text object
  `wrap`, but `src/shared/template/schema.ts` still decodes a missing `fitMode` as `none`: a label
  authored before wrapping existed must keep printing the way it printed, so the editor default
  applies only to objects the editor creates.
- Image objects carry `MonochromeOptions`, because thermal printers need a 1-bit bitmap and the
  dithering choice is a per-image design decision.

`label.json` comes from a file the app does not control, so it is parsed as `unknown` and
narrowed by the guards in `src/shared/template/guards.ts` before anything else touches it.

## Rendering

One template is drawn by four back ends, all implementing `LabelRenderer` from
`src/shared/render/types.ts`. Each takes a `LabelTemplate` plus a `RenderContext` of resolved
variable values and differs only in what it emits.

| Back end         | Output       | Used for                                 |
| ---------------- | ------------ | ---------------------------------------- |
| `CanvasRenderer` | draws        | The on-screen design surface             |
| `PdfRenderer`    | `Uint8Array` | Export to PDF, and driver-based printing |
| `ZplRenderer`    | `string`     | Zebra thermal printers                   |
| `TsplRenderer`   | `string`     | TSC and compatible thermal printers      |

The active implementations are `documentCanvas.ts`, `shared/render/svg.ts` and
`main/printing/renderWindow.ts`, described below. ZPL and TSPL renderer ports remain reserved for
future direct thermal-printer support.

## Where the remaining features go

### Printing

`src/main/printing/`. The `PrinterAdapter` interface abstracts how bytes reach a printer, with three
implementations matching the three realistic transports:

- `driver.ts` — `DriverPrinter`, printing through the installed Windows driver. Pairs with
  `PdfRenderer`; per-profile dispatch can select `GdiPrinter` for a native raster job.
- `gdi.ts` — `GdiPrinter`, job-local Winspool/GDI calls through the prebuilt Koffi FFI. Pairs with
  an exact-device-DPI bitmap rendered by `renderWindow.ts`.
- `raw.ts` — `RawSpoolerPrinter`, raw bytes through the Windows spooler for printers whose driver
  should not reinterpret the job. Pairs with `ZplRenderer`/`TsplRenderer`.
- `net9100.ts` — `Network9100Printer`, a raw TCP socket to port 9100 for networked thermal
  printers.

`queue.ts` defines the serialized job queue; `printIpc.ts` resolves prompts, reserves counter
blocks, creates one evaluated document per serialized record, and constructs the queue in front of
the driver adapter. Driver printing sends each distinct record with the requested copies. The PDF
path combines every record and copy into one multi-page document. Printing stays in the main process;
the renderer only submits a `PrintJobRequest`.

### Serialization and counters

`src/shared/variables.ts` is the pure evaluation engine used by design preview, SVG, export and
printing. It validates prompts, expands `{name}` templates, applies calendar-safe date offsets and
formats numeric, alphanumeric, hexadecimal and custom-alphabet counters. The same module extracts
template references and reports undefined and unused variables, following formula dependencies
transitively.

Renderer data fields display `{name}` references as non-editable chips while keeping the raw
template string as the document value. Brace-triggered autocomplete, drag/drop, menu binding and
text-selection conversion all call the same pure variable actions; no renderer-only representation
is serialized. A chip carries the value it stands for as its tooltip.

The canvas resolves `{name}` references to their values by default, so a date variable reads as a
date; View → Show Sample Data turns the raw expressions back on. Hovering a text, barcode or QR
object reveals its source expression in the canvas readout, split by `templateSegments` and tinted
per variable. Inline editing stays available with values on screen because `text:editing:entered`
reseeds the Fabric textbox with the source expression and `commitPatch` writes `text` back only for
the object that inline editing produced it for, so a resolved value can never replace the stored
expression.

### Spreadsheet data sources

Each template may store multiple `DataSourceDefinition` records. A definition contains an absolute
path or a path relative to the `.bar`, a worksheet or named Excel table, one-based header row,
unique key column, optional filter and column-to-field-variable mappings. Workbook bytes and rows
never enter the template archive.

`main/dataSources/workbook.ts` reads `.xlsx`, `.xls` and `.csv` with SheetJS CE 0.20.3, vendored
from the official CDN tarball. The normal Windows read path permits Excel's shared-read lock; a
temporary-copy retry covers environments that report a transient sharing error. True Excel table
names and ranges are read from the OOXML table relationships because SheetJS CE does not expose
them as workbook metadata. Inputs are capped at 50 MB, 100,000 rows and 1,000 columns.

All spreadsheet I/O stays in the main process behind typed, preload-allowlisted IPC. The renderer's
reusable record picker receives strings, hashes and tracking metadata only. `fs.watch` produces a
reload offer; it never causes an implicit print or workbook write. Status-column write-back is
deliberately unavailable in 0.3 and `writeStatusColumn` defaults to false.

Rows are SHA-256 hashed from a stable, column-sorted representation. The repository joins each
source/key to its latest print state. A different current hash is reported as changed without
destroying the printed/reprinted/voided/failed state. Empty and duplicate keys are warned and cannot
be selected. Successful printing records the job, serial and hash; later success becomes a reprint.
Failure records the attempted job. If the spooler accepts a job but repository finalization fails,
the serial reservation is not released and the UI explicitly warns against reprinting.

### Barcode symbologies

`src/shared/template/symbologies.ts` is the single table for the eleven linear symbologies: the
persisted schema value, the bwip-js encoder name (`codabar` encodes as `rationalizedCodabar`), the
interface label, the data rule, a valid example and whether the check digit is optional. The
`BarcodeSymbology` type, the zod enum, the Properties dropdown and the plain-language messages shown
in Properties and on the canvas all derive from that table. Changing the symbology never rewrites the
operator's data; the rule is explained instead. Barcodes on the canvas encode sample-resolved data
whether or not sample data is shown, so a bound variable renders as its sample value instead of the
literal `{variable}` text. `addCheckDigit` reaches bwip-js only where the table marks the check digit
optional: EAN, UPC and ITF-14 calculate their own, and ITF-14 would otherwise encode digits its
human-readable text does not show.

### GS1 encoding

`src/shared/gs1ApplicationIdentifiers.ts` is the single data table for the supported GS1 AIs and
cites the GS1 General Specifications AI table. It includes 00, 01, 02, 10, 11, 13, 15, 17, 21,
240, 241, 310x–316x, 37, 400, 410–414 and 8004. Parameterized measurement AIs resolve their final
decimal-position digit without duplicating 70 definitions.

`src/shared/gs1.ts` validates lengths, numeric/alphanumeric character sets and YYMMDD calendar
dates, calculates or verifies GTIN/SSCC/GLN check digits, emits parenthesized HRI and inserts ASCII
group separators after non-final variable-length element strings. Templates retain `{variable}`
expressions; final resolved values are validated again by the dedicated bwip-js `gs1-128`,
`gs1datamatrix` or `gs1qrcode` encoder during preview and print.

### Quality preflight

`src/shared/preflight.ts` is the renderer-safe source of truth for editor, batch and print quality
checks. It returns stable issue codes, severity, messages and optional object ids. Checks cover
whole/minimum printer dots, linear and matrix quiet zones, rotated bounds against rectangular,
rounded, circular and elliptical stock, safe margins, readable and fitted text, PNG/JPEG effective
DPI, object overlap with symbols, barcode/GS1 validation, variable usage, available document fonts and
hidden objects. SVG assets are treated as resolution-independent.

The docked panel recomputes from immutable document state and selects an issue's object on click.
Because that panel is only mounted while its tab is on screen, the editor shell also watches
preflight and raises a single error toast for the errors the design did not have a moment ago, keyed
by code and object id so a persistent error never toasts twice and one edit never raises more than
one toast; the toast selects the first offending object and brings the panel forward. It reads
sample values, because preview records are chosen only inside Print, the data-source dialog or Print
Station, all of which surface preflight in their own flow and stay silent.
Batch preflight evaluates each selected record with its own field values and counter offset before
summarizing affected rows. Print displays that summary. `preflightMode` defaults to `warn`; in
`strict` mode the renderer disables Print and the main-process handler independently rejects jobs
with errors before reserving serials.

### Print Station and template library

`--station` and the saved default mode select a dedicated renderer surface; the editor component
tree is not mounted. The operator flow lists only approved templates and progresses through prompt
values and/or the shared Excel record picker, preview, preflight, printer selection, submission and
confirmation. Recent jobs expose reason-required reprint and void actions recorded in the data
repository audit list. Jobs retain their printed record keys in repository settings; voiding a
matching current job also updates those tracking rows, while reprinting through the normal flow is
automatically classified as a reprint.

`src/main/station/library.ts` recursively scans up to 10,000 `.bar` files per configured local or
UNC folder without following directory symlinks. Every candidate passes the normal archive/schema
decoder. Metadata is indexed through `TemplateLibraryRepository`; embedded previews are cached
under user data and returned as data URLs. An unavailable network root reports an error while its
last valid index remains available.

Admin PINs are 4–12 digits and never leave the main process after entry. The repository stores only
a random 128-bit salt and a 256-bit Node `scrypt` result. Constant-time comparison protects editor
and exit requests. The installer creates a separate Start Menu shortcut with `--station`.

`src/main/serial/counters.ts` implements `SerialService` with Electron's built-in `node:sqlite`.
`BEGIN IMMEDIATE` reserves each block before printing, so concurrent jobs cannot receive the same
value. Per-template counters use their variable id; named global counters use a shared key. A
successful job commits the reservation. A failed job either burns it or releases it only when no
later reservation has advanced that counter. Period keys implement daily, monthly and yearly reset.
Print history and remembered prompt values are bounded JSON files under user data; the counter
ledger remains the authoritative transactional state.

### Barcode and QR rendering

Symbols use two paths:

- For thermal printers, `ZplRenderer` and `TsplRenderer` should emit the printer's **native**
  barcode commands, so the symbol is generated at the printer's full resolution.
- For the design canvas, `shared/render/barcode.ts` is loaded on demand when a document first
  contains a barcode or QR object. Batch preview/export/printing sends SVG work to the reusable
  Electron utility process in `printing/renderWorker.ts`, so barcode generation does not block the
  main process.

### Localhost print API

`src/main/server/printApi.ts` implements the optional `/v1` HTTP and WebSocket integration surface.
It is disabled by default and binds to `127.0.0.1`; binding all interfaces requires an explicit LAN
acknowledgement. If the configured port is occupied, the server chooses an available port and shows
the actual value in Preferences. The tray keeps an enabled server alive after editor windows close.

Tokens are random 256-bit values shown once and persisted only as SHA-256 digests. Read, preview and
print scopes are checked independently. Exact browser-origin allowlisting, private-network
preflight handling, per-client rate limits, header/body limits and timeouts are enforced before
work enters the print pipeline. Every HTTP request and WebSocket upgrade is audit logged.

Library and uploaded-archive jobs share normal schema decoding, pure variable evaluation, preflight
and `submitPrintRequest`, so API printing has the same counter reservations, record tracking and
history as the desktop surfaces. Multipart uploads are bounded and the archive decoder rejects path
traversal, links, excessive entries, expanded bytes and compression ratios. WebSockets publish
bounded job-state messages and never use URL query parameters for secrets. The complete interface
and examples are in `docs/INTEGRATION.md`.

### Database

`src/main/data/` owns all operational persistence behind `DataRepositories`; Drizzle ORM and its
dialect schemas remain implementation details below that boundary. The focused
repositories cover serial reservations, print history, prompt defaults, printer profiles, data
source tracking, the template-library index and database-owned settings. Printing obtains the
currently selected aggregate from `DataStoreManager`; it never opens a database directly.

SQLite remains the default and uses Electron's built-in `node:sqlite`. The consolidated store keeps
the historical `counters.db` filename so existing serial values survive the upgrade. Startup enables
WAL, full synchronization, foreign keys and a busy timeout, runs `PRAGMA integrity_check`, and then
applies generated, ordered migrations. A pre-existing database is checkpointed and copied to a timestamped
backup before its first pending migration. Legacy print-history, prompt-value and printer-profile
JSON files are imported idempotently and retained as recovery evidence.

MySQL and MariaDB use `mysql2`; PostgreSQL uses `pg`. None requires a compiled addon, and all
implement the same repository contract. Serial allocation holds one pooled connection for the
complete transaction, creates the counter row if needed, locks it with `SELECT ... FOR UPDATE`,
advances it and records the reservation before commit. Dynamic values use parameters. Drizzle Kit
generates separate SQLite, MySQL-compatible, and PostgreSQL migration trees. Before a pending server
migration, Barista writes a compressed logical backup of its existing tables into user data. The
shared live suite runs against the optional Docker stack described in `docs/DATA.md`.

`data-connection.json` is the only bootstrap persistence outside the selected database. It contains
the engine and public connection fields needed before a repository can open. Passwords are stored
as `safeStorage` ciphertext and never cross IPC after saving. If a selected remote store cannot be
opened, the manager remains unavailable and returns the connection error; it does not use SQLite
for serials or any other operation.

### Settings and template I/O

`src/main/storage/`. `paths.ts` resolves every user-data location from `app.getPath('userData')`;
`settings.ts` and `templates.ts` are the stores that read and write there. Nothing is ever written
to the install folder, because the app installs per-user without administrator rights.

## Build and packaging

`electron-vite` builds main, two CommonJS preloads and two renderer HTML entries
into `out/`. The splash does not import the React application bundle. `electron-builder` packages a per-user
NSIS installer (`perMachine: false`, `oneClick: false`) for Windows x64.

The dependency versions are pinned by a compatibility triangle worth knowing before upgrading:
electron-vite 5 peers on Vite `^5 || ^6 || ^7` while Vitest 5 requires `>= 6.4`, which fixes Vite at
7; `@vitejs/plugin-react` is held at 5.x because 6.x requires Vite 8; TypeScript is held at 5.9
because typescript-eslint supports `< 6.1`.

## Branding

`build/logo-original.png` preserves the supplied artwork. Lanczos-resized PNGs in
`src/renderer/src/assets` serve the title bar, splash and About dialog. The multi-resolution
`build/icon.ico` contains 16–256 px images and brands the Windows executable, installer,
uninstaller and shortcuts. Its copy in `src/renderer/public/branding` serves both window
icons and HTML favicons; electron-vite copies it into the packaged renderer.

The native caption overlay uses a transparent background so Fluent title-bar colours
and modal backdrops continue underneath it. Native button glyphs follow the app theme;
Windows retains hover, inactive and Snap Layout behavior.

## Document editing and archives

`useDocumentStore` owns a `LabelDocument`: the version-2 template plus a separate
base64 asset map. Its ordered object array is authoritative; actions normalize
`zIndex`. `labelSize` is a synchronized compatibility selector for the viewport.
Positions and sizes are mm, fonts are points and rotation is degrees. Ellipses and
optional flat `groupId` membership extend the format. Group members retain absolute
coordinates. Variables are not evaluated; the loader requires an empty variables
array while fixed object content is supported.

Undo/redo uses immutable snapshots with a default limit of 100, configurable in
Label Setup (1–1000, session scoped). Explicit begin/end gesture boundaries merge
field edits and held nudge keys; Fabric commits transforms on `object:modified`.
Dirty state compares with the saved snapshot. Snapshots share unchanged asset
strings. Selection, clipboard, zoom and tool defaults stay outside history.

`documentCanvas.ts` projects the model to Fabric and mirrors selection both ways.
Properties, Layers, options and command-registry operations write document actions.
Text supports inline editing. Alignment considers rotated bounds; snapping tests
the grid, label and other visible objects and draws transient guides. Label setup
keeps object geometry unchanged and Properties flags out-of-bounds objects. The design surface
draws the stock shape and safe-area guide. Image clipboard copies carry
assets across documents. Fonts resolve in a fixed order: document-embedded, user-imported, then
bundled. The UI, preview, PDF, and print surfaces all load the same font bytes; system fonts are
never queried. A missing family is reported with the affected object names before the bundled
Inter fallback is used.

`TemplateStore` writes ZIPs containing `manifest.json`, `label.json`, `preview.png` and `assets/`, via a temporary
sibling and rename. The loader bounds compressed/expanded sizes, rejects unexpected
or traversal entries, validates type-specific fields with Zod, and checks duplicate
IDs, references and asset lengths. Failures return `IpcResult`. Explicitly selected
documents/exports may live at user-selected paths; application-owned files remain
under `userDataPaths()`. `recent.json` stores recent paths. New/Open/close ask
Save/Discard/Cancel, with the document close gate ahead of workspace flushing.
Command-line and second-instance `.bar` paths use typed document events.

File > New opens the preset browser. Built-in thermal presets cover inch and metric media; sheet
presets are limited to layouts backed by vendor documentation. Named custom presets and recent
choices live in the selected data repository. Label Setup reuses the same stock editor. Sheet stock
prints the design at every row/column position using its physical pitch and sheet dimensions.

## Shared print rendering and physical page size

`shared/printSettings.ts` validates settings and computes layout in mm. Fit fills
the estimated printable rectangle; Actual is 100%; Shrink never enlarges; Custom
applies a percentage. Placement is centered, followed by calibration offsets.
Auto follows label orientation; explicit orientation swaps paper dimensions.
Choosing paper by label size requests the label dimensions and zero margins;
unchecking it uses the selected printer's default stock or explicit paper settings.

`shared/render/svg.ts` generates escaped, whitespace-preserving vector text and shapes, accepting
pre-rendered barcode/QR SVG from the symbol worker. The hidden renderer wraps text after fonts load and
resamples images at document DPI, optionally thresholding to black/white. Invalid
barcode data shows an inline editor error and blocks output.

One reusable utility process loads `bwip-js` and supplies barcode/QR SVG to one reusable sandboxed
hidden BrowserWindow. The BrowserWindow loads generated HTML from
`userData/render/print.html`; a serial promise chain prevents preview/export/print
races. Loading a file avoids Chromium's data-URL length limit. Rendering waits for
fonts and image decoding, without relying on animation frames in hidden windows.
The dialog displays the resulting SVG. PDF uses `printToPDF`; PNG draws that SVG at
the selected DPI. PDF pageSize is inches, CSS @page is mm, all margins are zero and
preferCSSPageSize is true. Chromium quantizes physical media internally, so pdf-lib
sets MediaBox and CropBox to exact mm-to-point dimensions without rasterizing text.
`pdf-lib`, the print dialog and the other modal dialogs are dynamically imported. Print-preview IPC
also caches the latest evaluated documents by bounded ids, so changing scale or placement does not
retransmit the whole label.

### Driver requests, observed failure and exact-size PDF fallback

Physical printers use `webContents.print` with `silent: true`, `deviceName`,
`margins: { marginType: 'none' }`, copies, collate, document DPI and printBackground.
Custom `pageSize` is integer microns (mm × 1000). Stock dimensions are normalized to
portrait and the `landscape` flag applies effective orientation. This is per-job;
Windows queue defaults are not changed.

Electron 44 returned printer names and empty options on this machine. Read-only
Win32_Printer/System.Printing queries supply default printer, status and default
stock dimensions. Printable bounds are visibly identified as estimates: arbitrary
job-specific capabilities and asymmetric hardware margins remain unqueried.

A direct **Microsoft Print to PDF** driver job requesting **60 × 35 mm** produced a
**612 × 792 point US Letter PDF**. A submission callback cannot prove media acceptance.
Selecting that printer now deliberately uses Barista's exact-size PDF renderer and
a native Save dialog, bypassing the driver's media substitution. Copies produce
repeated PDF pages. This is a documented transport exception, not a claim that the
Windows driver now honors arbitrary custom sizes. All 12 size/mode combinations
passed exact PDF page-box verification through this corrected path.

For physical drivers that ignore Electron media requests, each printer profile can select native
GDI. `gdi.ts` uses the prebuilt Koffi 3.3.1 FFI to query the full driver-owned DEVMODE, preserve its
private bytes, set job-local paper width/length (tenths of a millimetre), orientation, resolution,
copies and collation, and ask the driver to normalize it. `CreateDCW` then provides the actual X/Y
DPI; the complete configured page is rasterized at those dimensions and sent between
`StartDocW`/`StartPage`/`StretchDIBits`/`EndPage`/`EndDoc`. Every failure after `StartDocW` aborts
the job and every handle is closed in `finally`. Queue defaults are never mutated.

Printer Properties calls the documented `DocumentPropertiesW` prompt flow with the main HWND and
stores the resulting complete DEVMODE in that printer's database profile. Electron remains the
default method. Microsoft Print to PDF successfully accepted the native bitmap job in verification,
but normalized 60 × 35 mm custom media to 279.4 × 215.9 mm Letter landscape. That driver therefore
continues to require the Electron exact-PDF path for precise custom page boxes. A physical thermal
printer is still required to verify driver-specific media retention and feed alignment.

`PrintQueue` emits queued/printing/done/failed states, taskbar progress and Windows
notifications. Physical-printer "done" means spooler acceptance, not confirmed paper
output. Per-printer settings and driver DEVMODE bytes live in the selected database repository.
RAW and ZPL/TSPL printing remain future transports.

### Performance profile

The milestone-8 benchmark measures launch to the first usable workspace, aggregate Electron working
set after settling, loading a synthetic 2,000-object `.bar`, and rendering 100 print previews. On
the verification machine the final optimized build measured 903 ms, 424.2 MiB, 30.1 ms and 931 ms,
respectively, compared with 963 ms, 437.8 MiB, 31.0 ms and 964.2 ms before the changes. These are
single local runs and therefore directional. The production renderer's initial JavaScript bundle
fell from 4.63 MB to 2.84 MB; `bwip-js` moved into a 1.64 MB on-demand chunk.

Fabric 7.4 and ws 8.21 close the stored-SVG, gradient, archive-install and WebSocket advisories that
affected the former dependency graph; both production and complete `npm audit` reports are clean.
The optional native `canvas` package is neither rebuilt nor shipped (`npmRebuild: false`). Privileged
IPC additionally requires the registered main renderer and its main frame. See
[SECURITY.md](SECURITY.md) for the complete trust model, checklist and residual deployment risks.

### Verification and replacement branding

The calibration label was created
through editor controls, saved with the Desktop SVG as an asset, reopened and
printed in all 12 stock/mode combinations. Page boxes are measured programmatically.

`build/logo.svg` preserves the replacement SVG. Its renderer copy serves the title
bar, splash and About dialog. Chromium rasterization produces PNG derivatives and
multi-resolution Windows icons for the app, installer and uninstaller.
`scripts/render-branding.mjs` regenerates the raster source.

References: [Electron printing](https://www.electronjs.org/docs/latest/api/web-contents),
[bwip-js](https://github.com/metafloor/bwip-js).
