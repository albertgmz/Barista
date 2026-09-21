# Releases and code signing

Every push or pull request to `main` runs the Windows quality gates. Each successful push to `main`
also builds and publishes an unsigned installer and portable executable, `latest.yml`, and SHA-256
checksums as a GitHub Release. The first push for a package version creates its stable tag (for
example `v0.5.0`); later pushes create build tags such as `v0.5.0-build.42`.

The stable release takes its polished notes from the matching `CHANGELOG.md` section. Build releases
use a “What's New” section generated from commits since the prior release, so every published build
contains its complete change list.

## Unsigned builds

Current public artifacts are unsigned. Windows SmartScreen may warn when they are downloaded. Users
should download only from this repository's Releases page and compare files with `SHA256SUMS.txt`.

## Adding code signing later

1. Obtain a Windows Authenticode certificate from a trusted certificate authority and export it as
   a password-protected PKCS#12 file, or configure a supported hardware/cloud signing service.
2. Add the certificate as a base64 data URL in the `CSC_LINK` repository secret and its password in
   `CSC_KEY_PASSWORD`. Restrict both secrets to the release environment.
3. Pass those secrets only to the tag-triggered build step. Never expose them to pull requests or
   the ordinary `main` build.
4. Keep `electron-builder`'s signature verification enabled, build a test tag, and verify both the
   executable and uninstaller with `Get-AuthenticodeSignature` before publishing.
5. Update the README, changelog, and release notes only after the signed workflow is verified.
