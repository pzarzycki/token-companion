<div align="center">

<img src="resources/icon.png" alt="Token Companion" width="128" height="128" />

# Token Companion

**See exactly what your AI coding agents cost you.**

A local, privacy-first desktop app that analyzes precise token spend across your
Claude and Codex sessions — conversations, per-model token breakdowns
(input / cache-read / cache-write / output), and cost mapped to fully editable pricing.

<br />

[![Release](https://img.shields.io/github/v/release/OWNER/token-companion?style=flat-square&logo=github)](https://github.com/OWNER/token-companion/releases)
[![Downloads](https://img.shields.io/github/downloads/OWNER/token-companion/total?style=flat-square&logo=github)](https://github.com/OWNER/token-companion/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/OWNER/token-companion/build.yml?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/OWNER/token-companion/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-online-8b5cf6?style=flat-square&logo=readthedocs&logoColor=white)](https://OWNER.github.io/token-companion)

<br />

[**Download**](#-download) &nbsp;·&nbsp; [**Documentation**](https://OWNER.github.io/token-companion) &nbsp;·&nbsp; [**What it reads**](#-what-it-reads) &nbsp;·&nbsp; [**Contributing**](#-contributing)

<br />

<img src="docs/assets/scr-sessions.jpg" alt="Token Companion — sessions view" width="820" />

</div>

---

## ✨ Highlights

- 🔒 **100% local.** Your session data never leaves your machine. No accounts, no telemetry, no cloud.
- 🎯 **Exact token counts.** Reads the real `usage` records your agents write to disk — not estimates.
- 💸 **Cost mapped to editable pricing.** Per-MTok input/output plus cache multipliers, all editable in-app.
- 🤖 **Multi-agent.** Claude (CLI, Desktop, VS Code) and Codex CLI in one view.
- 📊 **Breakdowns that matter.** By model, by session, over time.

---

## 📥 Download

Grab the latest build for your platform from the [**Releases**](https://github.com/OWNER/token-companion/releases/latest) page.

| Platform | Download | Notes |
|---|---|---|
| 🍎 **macOS** | [`.dmg`](https://github.com/OWNER/token-companion/releases/latest) | Apple Silicon + Intel. Unsigned — see [install notes](https://OWNER.github.io/token-companion/install#macos). |
| 🪟 **Windows** | [`.exe`](https://github.com/OWNER/token-companion/releases/latest) | <sub>🚧 Coming soon</sub> |
| 🐧 **Linux** | [`.AppImage`](https://github.com/OWNER/token-companion/releases/latest) | <sub>🚧 Coming soon</sub> |

> 📖 Full install instructions live in the [**documentation**](https://OWNER.github.io/token-companion/install).

---

## 🔍 What it reads

| Source | Location | Token data |
|---|---|---|
| Claude CLI + Desktop agent modes (1p/3p) + VS Code | `~/.claude/projects/**/*.jsonl` | ✅ per-message `usage` |
| Claude 3p title-gen | `~/Library/Application Support/Claude-3p/title-gen/**/*.jsonl` | ✅ |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` | ✅ last cumulative `token_count` per session |
| Claude/Codex Desktop plain chat | `…/IndexedDB`, `…/Local Storage/leveldb` | ⚠️ discovery only — binary stores with **no token counts** (shown as a "not yet counted" gap) |

**Key parsing rules** (validated against real data via `scripts/verify.mjs`):

- **Claude** usage is **per assistant message** → summed; deduped on `message.id` to drop session-resume replays (removes ~60% duplicate records).
- **Codex** `total_token_usage` is **cumulative per session** → take the **last** event, never sum (summing overcounts ~7×).

---

## 🚀 Building from source

Token Companion is an [Electron](https://www.electronjs.org/) app (Electron + React + Vite via [`electron-vite`](https://electron-vite.org/)). You can build it on macOS, Windows, and Linux. Builds are **not cross-platform** — the app bundles a native module (`classic-level`) that is compiled for the host OS/architecture, so **build each platform on that platform** (or in CI on the matching runner).

### Prerequisites (all platforms)

- **[Node.js](https://nodejs.org/) 20+** (tested on Node 24) and npm.
- A **C/C++ toolchain** — `classic-level` is a native addon compiled on install:

| Platform | Toolchain |
|---|---|
| 🍎 **macOS** | Xcode Command Line Tools: `xcode-select --install` |
| 🪟 **Windows** | [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) with the "Desktop development with C++" workload (or `npm i -g windows-build-tools` on older setups) |
| 🐧 **Linux** | `build-essential` + Python 3, e.g. `sudo apt install build-essential python3` |

### Clone & install

```bash
git clone https://github.com/OWNER/token-companion.git
cd token-companion
npm install          # also compiles the classic-level native module for your OS
```

### Run in development

```bash
npm run typecheck    # type-check main + renderer
npm run dev          # launch the app with hot reload
```

> 💡 In dev, macOS may still show **"Electron"** in some places (it reads the dev binary's bundle metadata). The **packaged** app always shows "Token Companion".

### Build a distributable

Run the target for your OS. Output lands in `release/`.

```bash
# macOS  → release/*.dmg  (Apple Silicon + Intel)
npm run build:mac

# Windows → release/*.exe  (NSIS installer)
npm run build:win

# Linux  → release/*.AppImage
npm run build:linux
```

Extra scripts:

```bash
npm run build        # fast unpacked build for the current OS (release/<platform>/…, no installer)
npm run build:dist   # installer(s) for the current OS (same as the per-OS scripts above)
```

> ⚠️ **Code signing.** Builds are **unsigned** by default. On macOS, downloaded unsigned apps are blocked by Gatekeeper — see the [install notes](https://OWNER.github.io/token-companion/install#macos) for the right-click-Open / `xattr` workaround. On Windows, SmartScreen shows a warning until the app earns reputation. Linux AppImages need no signing (`chmod +x` and run). Proper signing/notarization requires paid certificates (Apple Developer Program, a Windows code-signing cert) and is not required to build locally.

### Verify parsing & cost math

```bash
node scripts/verify.mjs   # dependency-free check against your real Claude/Codex session data
```

### Regenerate the app icon

The icon is generated by a pure-Python (stdlib-only) script — no image libraries needed:

```bash
python3 scripts/gen_icon.py   # writes resources/icon.png + resources/icon.icns
```

---

## 💸 Pricing

Rates live in [`resources/pricing.default.json`](resources/pricing.default.json) (per-MTok input/output + cache multipliers). On first run they're copied to `<userData>/pricing.json`, which the in-app **Pricing** tab edits. OpenAI/Codex rates are placeholders flagged `verify` — confirm them in the Pricing tab.

---

## 🏗 Architecture

```
src/
├── main/        Electron main process — file scanning, JSONL parsers,
│                LevelDB probe, pricing persistence. All file I/O here.
├── preload/     contextBridge exposing a typed window.api
├── renderer/    React + Vite UI (Dashboard, Models, Sessions, Pricing)
└── shared/      Types, IPC contract, and the pure aggregation/costing
                 engine (also used by the renderer)
```

---

## 🗺 Roadmap / Known gaps

- [ ] **Plain desktop-chat token counting.** Claude 1p/3p regular chat and Codex Desktop conversations are detected but not counted — their binary stores record no usage. Planned: full LevelDB transcript extraction → local tokenizer to estimate tokens.
- [ ] **Verified OpenAI/Codex pricing.**
- [ ] **Windows & Linux builds.**
- [ ] **Documentation site** at [OWNER.github.io/token-companion](https://OWNER.github.io/token-companion).

---

## 🤝 Contributing

Contributions are welcome! <!-- TODO: add CONTRIBUTING.md and issue templates -->

1. Fork the repo and create a feature branch.
2. Run `npm run typecheck` and `node scripts/verify.mjs` before opening a PR.
3. Open a pull request describing your change.

---

## 📄 License

[MIT](LICENSE) © Pawel Zarzycki

<div align="center">
<sub>Built with Electron, React, and Vite.</sub>
</div>
