# token-companion

`token-companion` is the npm bootstrapper for the Token Companion desktop app.

## Use `npx`, not `npm i`

```bash
npx token-companion
```

If `npx` is missing, install Node.js 22.12.0 or newer first:

https://nodejs.org/en/download

The npmjs.com package page shows `npm i token-companion` because that install box is generic npm UI. For this package, the intended entry point is `npx token-companion`.

## What this package does

This package is intentionally small. It does not contain the full Electron app bundle.

When you run it, it:

1. resolves the installer package version,
2. downloads the matching GitHub source tag,
3. runs the checked-in installer from that source tree,
4. builds the Electron app locally,
5. installs the built app for your platform.

Platform behavior:

- macOS: builds the app and copies `Token Companion.app` into `~/Applications` by default.
- Windows: builds a local NSIS installer and runs it for a per-user install with Start Menu and uninstall support.
- Linux: builds the native package and installs it with the system package manager.

Example source tarball:

`https://github.com/pzarzycki/token-companion/archive/refs/tags/v0.1.9.tar.gz`

## Useful commands

```bash
npx token-companion --dry-run
npx token-companion@latest
npx token-companion@0.1.9
npx token-companion --version v0.1.9
```

## Update behavior

- `npx token-companion` is not a background app auto-updater.
- Running a newer installer version builds and installs a newer desktop app version.
- npm can reuse cached installer packages. If you want the newest published installer immediately, run `npx token-companion@latest`.

## Notes

- The npm package is only the bootstrapper. The Electron app itself is built from the matching GitHub source tag on the local machine.
- `npm run verify` is a contributor validation command and is not part of the end-user install flow.
- Windows SmartScreen and macOS Gatekeeper warnings may still occur because the built artifacts are unsigned.

## Release model

- GitHub tags `vX.Y.Z` are the release source of truth.
- GitHub Actions builds release artifacts and publishes this npm package from `packages/npm-installer`.
- npm Trusted Publishing should be used for steady-state releases.

Project source and release notes:

https://github.com/pzarzycki/token-companion
