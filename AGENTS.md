# Agent Instructions

Barista is a strict-TypeScript Electron label designer and print application for Windows.

## Workflow

- Use npm; `npm install` also fetches Electron through the `postinstall` hook.
- Release versions use coffee codenames; record the version and codename in `CHANGELOG.md`.
- Keep durable decisions in the relevant current document under `docs/`; do not create session logs.
- Do not mention automated code generation in product content, commits, or release notes.

## Commands

| Task | Command |
| --- | --- |
| Run | `npm run dev` |
| Test one file | `npx vitest run src/shared/units.test.ts` |
| Lint one file | `npx eslint src/main/index.ts` |
| Full verification | `npm run typecheck && npm run lint && npm run format:check && npm run test` |
| Installer and portable | `build.bat installer` / `build.bat portable` |

## References

| Need | File |
| --- | --- |
| Process model, IPC, document format | `docs/ARCHITECTURE.md` |
| Data repositories and test servers | `docs/DATA.md` |
| Integration server | `docs/INTEGRATION.md` |
| Security design | `docs/SECURITY.md` |
| IPC channel contract | `src/shared/ipc/contract.ts` |

## Conventions

- Preserve repository interfaces; Drizzle and database drivers stay implementation details.
- Add IPC channels to `src/shared/ipc/contract.ts` before handlers or renderer calls.
- Return `IpcResult<T>` from fallible IPC handlers; never throw across the process boundary.
- Keep `src/shared/` free of DOM types and the `NodeJS` namespace.
- Use Fluent UI for application controls and existing design tokens for styling.
- Store and calculate geometry in millimetres; use `src/shared/units.ts` for conversions.
- Write user data only below `app.getPath('userData')` through `src/main/storage/paths.ts`.
- Keep `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
- Keep the sandboxed preload CommonJS and limited to Electron; do not add `"type": "module"`.
- Do not add native modules. Keep `electron-builder.yml` `npmRebuild: false` unless this rule changes.
- Preserve the `did-finish-load` reveal fallback; Electron 44 can omit `ready-to-show` with overlays.

## Verification

- Add tests for every behavior change and regression fix.
- Run typecheck, lint, format check, and the full test suite before each milestone commit.
- For UI changes, run the Electron smoke harness; keep its generated evidence untracked.
- Never commit generated `out/`, `release/`, `dist/`, `scratch/`, logs, secrets, or local env files.
