# Local diagnostics

Barista collects nothing automatically and sends nothing anywhere. Diagnostic data stays in the
current Windows user's Barista data folder until that user deliberately shares a file. The
diagnostics implementation contains no HTTP client, upload endpoint, telemetry SDK, or background
reporting path.

## What is recorded

The main process writes structured JSONL events for application start and stop, the app version,
redacted preferences, print starts/results, printer names, data-source operations, integration
server method/path/status (never request or response bodies), database engine and migration state,
warnings and errors, renderer/child process failures, unhandled errors, and useful durations.
Preferences ▸ Diagnostics selects error, warning, information (the default), or debug verbosity.
Starting with `--verbose` temporarily enables debug logging.

A renderer that goes away is recorded as `renderer.gone` with both the reason and the process exit
code, which is what separates an out-of-memory kill from a crash from a forced termination.

Logs live under `%APPDATA%\barista\logs`. The active file is `barista.jsonl`; it rotates before it
exceeds 10 MB and rotated files older than seven days are deleted. Writes are queued away from the
UI and print path. Help ▸ View Logs provides level/time filters, search, selected-line copy, and a
button to open the folder.

## Editor breadcrumbs

Process lifecycle events alone cannot explain an editor problem, so the renderer records a short
trail of what was being done to the label. These are logged at information level:

| Event                                                 | Context                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `editor.objects-added` / `editor.objects-removed`     | `kind`, `count`                                                          |
| `editor.symbology-changed`                            | `from`, `to`                                                             |
| `editor.barcode-failed`                               | `symbology`, `code` — the encoder failure name, such as `ean13badLength` |
| `editor.preflight`                                    | `errors`, `warnings`                                                     |
| `editor.variable-created` / `editor.variable-deleted` | `kind`, `count`                                                          |
| `editor.variable-kind-changed`                        | `from`, `to`                                                             |
| `editor.document-opened` / `editor.document-saved`    | `objects`, `variables`                                                   |
| `editor.export-failed`                                | `format`, `code`                                                         |

Breadcrumbs report differences, not keystrokes. Typing, dragging, restyling and canvas rebuilds
produce nothing; only a change in the object counts, a symbology, which encoder error a barcode
raises, or the preflight totals does. An unfixed barcode is reported once, not once per character.
Loading a label reports its size, never the objects in it, and starts a fresh trail so that two
labels are never compared with each other.

### The privacy boundary

Counts, object kinds, symbologies and failure codes are the whole vocabulary. Object names, text,
barcode data, variable values, spreadsheet fields and file paths are outside it, and breadcrumbs
have no field one could be put in.

The renderer is not trusted to honour that. The main process rebuilds every breadcrumb field by
field before logging it, and anything it does not name is discarded rather than copied. Unknown
events are dropped. Object kinds, symbologies and export failure codes are closed sets taken from
the file format and the IPC contract, so a value outside them drops the breadcrumb. Counts must be
non-negative integers. The one field that is not a closed set is the bwip-js failure name, because
bwipp defines hundreds of them; it must be an identifier — `[A-Za-z][A-Za-z0-9]{0,47}` — which
excludes an encoder's full message and the shapes operator data takes, since a GTIN or serial leads
with a digit and a lot code or file name carries a separator. The recursive redaction below then
runs over the result as it does over every other event.

Preflight composes its messages as `<object name> has invalid data: <encoder message>`, so the
failure name is read from the **last** `bwipp.` in the message, never the first: an object may be
named anything, including something that looks like an encoder failure, and the name is always the
prefix.

## Redaction

One recursive redaction boundary runs before JSON serialization and disk writes. It removes
database passwords and credentialed connection strings, API tokens except their last four
characters, the admin PIN and hash, spreadsheet/resolved variable values, serial values, and the
Windows username in paths (`%USER%` replaces it). Error messages and stack traces use the same
boundary. Bundle creation repeats redaction as defense in depth. Tests inject passwords, tokens,
data values, serials, and username paths and inspect both JSONL and ZIP bytes.

## Diagnostic reports

Choose Help ▸ Create Diagnostic Report… (also available from About and command-failure notices) to
create `Barista-diagnostic-<version>-<timestamp>.zip` under `%APPDATA%\barista\diagnostics`. The
dialog accepts an optional problem description, shows progress, and then offers **Show file**,
**View contents**, and **Open containing folder**.

The ZIP contains:

- `summary.txt` and `system-report.json`: release/build/install type, Windows and runtime versions,
  architecture, memory, displays/scaling, locale, selected database engine, integration-server
  state, and installed printer/driver names;
- `logs/` and available Electron dumps from `crash/`;
- redacted `preferences.json` and `workspace.json`;
- `database-info.json`: public engine settings, schema/migration status, table row counts, and
  integrity result—never table contents.

The current `.bar` file and last print job's resolved data are off by default. Each requires its
own explicit checkbox and a warning because those optional files contain label or production data.

Renderer/main/child crashes and a renderer that remains unresponsive generate the same local ZIP.
On the next start Barista displays one non-intrusive notice for that crash with **Show file**,
**View contents**, and **Dismiss**. Dismissing acknowledges only that crash; nothing is uploaded.

Before attaching a diagnostic ZIP to a GitHub bug report, use **View contents**, extract and inspect
the archive if needed, and leave both optional-content boxes clear unless that data is necessary and
safe to share.
