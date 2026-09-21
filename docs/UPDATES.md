# Application updates

Installed Barista builds use `electron-updater` with the public GitHub Releases feed for
`albertgmz/Barista`. The application waits until the workspace is ready, then checks after five
seconds without blocking startup. While Barista remains open it checks again every four hours.

Preferences ▸ Updates controls automatic checks and automatic download. Both default to safe
settings: checks are enabled, downloads are disabled. A downloaded update is never installed until
the user chooses **Restart and Install**. **About Barista ▸ Check for Updates** exposes the complete
state: checking, current, available with release notes, downloading with progress, ready to install,
or an error. Network and GitHub API failures remain in this panel and never crash or block the app.

Portable builds do not initialize the updater and cannot replace themselves. Their About panel
opens the public Releases page instead. Development builds do not contact the release feed.

Release automation publishes the installer, portable executable, installer blockmap,
`latest.yml`, and SHA-256 checksums together. Current executables are unsigned, so Windows
SmartScreen may warn; compare the downloaded artifact against `SHA256SUMS.txt`. The optional future
code-signing procedure is in [`RELEASING.md`](RELEASING.md).
