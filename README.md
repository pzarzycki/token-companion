<div align="center">

<img src="resources/icon.png" alt="Token Companion" width="128" height="128" />

# Token Companion

**See exactly what your AI coding sessions cost.**

Local, privacy-first desktop analytics for Claude and Codex usage records already on disk.

[![Release](https://img.shields.io/github/v/release/pzarzycki/token-companion?style=flat-square&logo=github)](https://github.com/pzarzycki/token-companion/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/pzarzycki/token-companion/build.yml?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/pzarzycki/token-companion/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-online-8b5cf6?style=flat-square&logo=readthedocs&logoColor=white)](https://pzarzycki.github.io/token-companion/)

[Download](#download) · [Documentation](https://pzarzycki.github.io/token-companion/) · [What it reads](#what-it-reads) · [Building](#building-from-source)

<img src="docs/assets/scr-sessions.jpg" alt="Token Companion sessions view" width="820" />

</div>

## Highlights

- 100% local. No accounts, no telemetry, no cloud sync.
- Exact token counts from real usage records, not estimates.
- Editable per-model pricing in the app.
- One view across Claude CLI, Claude Desktop agent modes, VS Code, and Codex CLI.
- Session, model, and project-folder attribution.

## Download

Grab the latest build from [GitHub Releases](https://github.com/pzarzycki/token-companion/releases/latest).

| Platform | Artifact | Notes |
|---|---|---|
| macOS | `.dmg` | Unsigned disk image. |
| Windows | `Setup.exe` | Built with Squirrel.Windows; SmartScreen warning expected until signed. |
| Linux | `.deb` / `.rpm` | Native distro packages for Debian/Ubuntu and Fedora/RHEL style systems. |

Install details: [docs](https://pzarzycki.github.io/token-companion/install/).

## What it reads

| Source | Location | Token data |
|---|---|---|
| Claude CLI + Claude Desktop agent modes + VS Code | `~/.claude/projects/**/*.jsonl` | Per-message `usage` |
| Claude 3p title-gen | `~/Library/Application Support/Claude-3p/title-gen/**/*.jsonl` | Usage records |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` | Last cumulative `token_count` per session |
| Claude/Codex desktop plain chat | IndexedDB / LevelDB stores | Discovery only; no token counts exposed |

Validation rules in `scripts/verify.mjs`:

- Claude usage is summed per assistant message and deduplicated on `message.id`.
- Codex totals are taken from the last cumulative session snapshot, never summed across events.

## Building From Source

Token Companion uses [Electron Forge](https://www.electronforge.io/) with the stable webpack pipeline, React 19, Astro 7 for docs, and TypeScript 6. Builds are platform-local because `classic-level` is a native dependency and the distributables are OS-specific.

### Prerequisites

- Node.js 24 LTS and npm
- macOS: Xcode Command Line Tools
- Windows: Visual Studio Build Tools with Desktop development with C++
- Linux: `build-essential`, Python 3, `fakeroot`, and `rpm`

### Install

```bash
git clone https://github.com/pzarzycki/token-companion.git
cd token-companion
npm install
```

The repo pins npm's cache to a local `.npm-cache/` directory to avoid Windows profile-cache permission issues during install.

### Development

```bash
npm run typecheck
npm run dev
```

### Build

```bash
# Package the current OS without making installers
npm run package

# Make all distributables for the current OS
npm run make

# Platform-specific makers when you are on that OS
npm run make:mac
npm run make:win
npm run make:linux
```

Output lands in `out/` and `out/make/`.

Packaging targets:

- macOS: `dmg`
- Windows: Squirrel `Setup.exe` + `.nupkg` + `RELEASES`
- Linux: `deb` + `rpm`

### Verify

```bash
npm run verify
npm run audit:prod
npm run audit
```

## Security Posture

- Full `npm audit` and production-only `npm audit --omit=dev` are expected to pass clean on a fresh install.
- The packaged app enables Electron fuses, uses `contextIsolation`, runs the renderer sandboxed, and denies browser permission requests by default.
- The preload bridge exposes a small typed API only, and session-entry IPC now rejects file paths outside the known Claude/Codex session roots.

### Regenerate icons

```bash
python scripts/gen_icon.py
```

This writes `resources/icon.png`, `resources/icon.icns`, and `resources/icon.ico`.

## Pricing

Default rates live in [resources/pricing.default.json](resources/pricing.default.json). They are bundled into the app and copied to `<userData>/pricing.json` on first run, which the in-app Pricing tab edits. OpenAI / Codex entries marked `verify` should be confirmed before relying on totals.

## Architecture

```text
src/
├── main/      Electron main process: scanning, parsing, pricing persistence, IPC
├── preload/   Typed contextBridge API
├── renderer/  React UI
└── shared/    Shared types and pure aggregation logic
```

## Known Gaps

- Plain desktop-chat stores are detected but not yet costed because they do not expose token usage directly.
- Some OpenAI / Codex pricing defaults are still placeholders.

## License

[MIT](LICENSE) © Pawel Zarzycki

<div align="center">
<sub>Built with Electron, Electron Forge, webpack, React, and TypeScript.</sub>
</div>
