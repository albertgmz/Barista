# Barista security

## Security model

Barista is a single-user Windows desktop application. The trusted computing base is the packaged
application, Electron/Node, Windows, installed printer drivers, the selected database driver and the
dependencies in `package-lock.json`. Label archives, spreadsheets, integration requests, browser
origins, LAN peers and template-library files are untrusted data.

The admin PIN is an operator/kiosk control, not an operating-system security boundary. A process
already running as the same Windows user can read or modify that user's files and can automate the
application. Windows account separation, filesystem ACLs and network/firewall policy remain the
deployment boundary.

## Threat model

| Threat                                    | Exposure                                                                       | Mitigations                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious `.bar` file                     | ZIP bombs, traversal, links, invalid schemas, hostile SVG/text, code execution | Archives are data only. Entry names are allowlisted; traversal and symlinks are rejected; entry count, compressed ratio, per-entry and total expansion are bounded; hashes, byte lengths and Zod schemas are checked. There is no `eval`, script field or template compilation. Renderer CSP and sandboxing remain active.                                     |
| Local web page calling the server         | Cross-origin printing or data discovery                                        | Server is disabled and loopback-only by default. Exact origin allowlisting is enforced before authentication; CORS/PNA preflight is explicit. Every endpoint requires a scoped bearer token and every request is audited.                                                                                                                                      |
| LAN client                                | Unauthorized access, sniffing, denial of service                               | LAN binding needs a separate acknowledgement and displays an unencrypted-HTTP warning. Tokens have read/preview/print scopes. Requests, headers, bodies, multipart parts, uploads, rates, WebSocket clients and time are bounded. Deployments must use a trusted/firewalled network because the built-in server does not provide TLS.                          |
| Stolen API token                          | Read, preview or print within token scope                                      | Tokens contain 256 random bits, are shown once, stored only as SHA-256 digests, compared in constant time and can be revoked. Tokens are not accepted in URLs. WebSocket token subprotocols are consumed but never echoed. Audit records identify token name and client.                                                                                       |
| SQL injection                             | Workbook fields, labels, keys or API values reaching SQLite/MySQL              | All dynamic values use SQLite prepared statements or `mysql2.execute` placeholders. Table/column names come only from static migrations. MySQL migrations are application constants.                                                                                                                                                                           |
| Compromised Excel file                    | Excessive expansion, parser resource use, formula payloads, duplicate identity | Input is read-only, capped at 50 MB compressed, 10,000 ZIP entries, 250 MB expanded and a 100:1 ratio. Rows and columns are capped. Sheet formulas are not executed by Barista; SheetJS supplies stored/display values. Keys must be non-empty and unique before printing. Temporary shared-read copies use unpredictable private directories and are removed. |
| Dependency compromise or known CVE        | Build/runtime code execution, XSS, denial of service                           | npm uses the committed lockfile and integrity hashes. `npm audit` is a release gate. Fabric 7.4.0 and ws 8.21.3 resolve the 0.3 review findings. Optional native `canvas` is excluded from packages; only Koffi's prebuilt N-API binary is shipped. Install scripts are fail-closed by local npm policy.                                                       |
| Malicious/buggy printer driver or DEVMODE | Native crash, unexpected dialog or output                                      | GDI is opt-in per printer. Buffer sizes and numeric ranges are checked; the driver normalizes DEVMODE; all native return values are checked; partial documents are aborted and every handle is closed. Native errors become normal failed jobs.                                                                                                                |
| Database or workbook credential theft     | MySQL password disclosure                                                      | Electron `safeStorage` protects the password and the plaintext never crosses IPC after saving. TLS defaults on and certificate verification is not disabled. Disabling TLS is explicit and warned in Preferences.                                                                                                                                              |

## Electron hardening checklist

- [x] `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on every window.
- [x] The preload bridge exposes typed, explicit channel allowlists and imports only Electron.
- [x] Privileged invoke handlers accept only the registered main window's main frame.
- [x] Popups are denied globally and navigation is restricted to the packaged renderer directory (or
      the development-server origin in development only).
- [x] Permission request and permission check handlers deny every Chromium permission.
- [x] Packaged builds block reload and developer-tools shortcuts.
- [x] Editor, splash and generated print HTML each carry a restrictive CSP. The editor denies
      objects, frames, forms and base-URL changes; generated print HTML uses `default-src 'none'`.
- [x] No `shell.openExternal` bridge or remote-content surface exists, so there is no external URL
      allowlist to bypass.
- [x] All application windows load local content; no remote page receives the preload bridge.

## Integration controls

- HTTP defaults to `127.0.0.1:17777`; `0.0.0.0` requires explicit LAN acknowledgement.
- Responses use `no-store`, `nosniff`, `DENY` framing, no-referrer and a deny-all CSP.
- JSON is capped at 1 MB and uploaded `.bar` files at 25 MB before archive expansion checks.
- Requests are limited to 120 per client per minute; stale rate entries and job state are bounded.
- At most 100 authenticated WebSockets are retained, compression is disabled and messages are
  capped at 16 KB.
- Preflight and strict mode apply before integration printing enters the shared serial/tracking path.

## Credentials and local controls

- MySQL passwords use Windows-backed Electron `safeStorage`; saving fails closed when it is
  unavailable.
- Station PINs use a random 128-bit salt and Node `scrypt`, with constant-time comparison. Five
  failures produce a 30-second in-memory lockout.
- API token material uses `crypto.randomBytes`; only digests and non-secret metadata persist.
- Serial allocation is transactional (`BEGIN IMMEDIATE` locally and `SELECT ... FOR UPDATE`
  remotely), preventing duplicate counter issuance between stations.

## Review findings resolved for 0.3.0

1. **Critical dependency chain:** Fabric 6's optional Canvas 2 dependency included vulnerable
   `node-tar`. Although Canvas was excluded from packaged artifacts, Fabric was upgraded to 7.4.0;
   the vulnerable chain is gone.
2. **Fabric SVG XSS advisories:** upgraded from 6.9.1 to 7.4.0. The editor workflow was exercised in
   real Electron after the major upgrade.
3. **WebSocket memory disclosure/exhaustion advisories:** upgraded from ws 8.20.0 to 8.21.3 and
   retained explicit payload/client/rate bounds.
4. **IPC sender authorization:** typed handlers now reject every sender except the registered main
   window's main frame. A real second renderer is used as the negative verification case.
5. **Excel archive resource exhaustion:** added expansion, entry and ratio limits before SheetJS
   parses OOXML, plus a regression test.
6. **Integration response and upgrade hardening:** added security headers, WebSocket rate/client
   limits and an explicit plaintext-LAN disclosure.
7. **Station PIN brute force:** added a five-attempt temporary lockout in the main process.

`npm audit` reports zero vulnerabilities for both the complete and production dependency trees as
of 2026-09-20.

## Residual risks and deployment guidance

- The integration server is HTTP, not HTTPS. Keep loopback binding unless the host is on a trusted,
  firewalled LAN; use a TLS-terminating reverse proxy if tokens must cross an untrusted network.
- MySQL can be configured without TLS for legacy networks. That exposes credentials and label data;
  keep TLS enabled outside an isolated network.
- Printer drivers execute vendor code in the application process boundary. Validate GDI with each
  target driver and keep Windows and drivers patched.
- The Station PIN does not resist a malicious same-user process or modification of local user data.
  Use separate Windows accounts and OS kiosk policy when hostile local users are in scope.
- Release signing depends on the build environment's code-signing certificate. Unsigned local builds
  do not provide publisher identity and may trigger Windows reputation warnings.
- A physical thermal printer was unavailable during this review. Custom-media retention, printable
  origins and feed alignment remain hardware acceptance tests.

Report suspected vulnerabilities privately to the repository owner and include the affected
version, reproduction steps and impact. Do not include live API tokens or database credentials.
