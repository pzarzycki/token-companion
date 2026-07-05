# token-companion

`token-companion` is the npm installer package for the Token Companion desktop app.

## Install

Run the installer with `npx`:

```bash
npx token-companion
```

It downloads the selected Token Companion source release from GitHub, builds the Electron app on your machine, and installs the resulting desktop app for your operating system.

## Prerequisite

Install Node.js 24 or newer first if `npx` is missing:

https://nodejs.org/en/download

## Useful commands

```bash
npx token-companion --dry-run
npx token-companion --version v0.1.2
```

## Notes

- macOS and Linux fallback to the shell installer published in the GitHub repository.
- Windows fallback uses the PowerShell installer published in the GitHub repository.
- Unsigned GitHub release binaries are also available when you prefer direct downloads.

Project source and release notes:

https://github.com/pzarzycki/token-companion
