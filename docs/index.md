---
hide:
  - navigation
  - toc
---

<div class="tc-hero" markdown>

<span class="tc-hero-eyebrow">v0.1.0 &nbsp;·&nbsp; Open Source &nbsp;·&nbsp; MIT</span>

# See exactly what your <em>AI coding agents</em> cost you

<p class="tc-tagline">
Token Companion reads real usage records from Claude and Codex sessions on your machine —
counts every token, maps them to fully editable per-model pricing, and shows the breakdown.
</p>

<div class="tc-hero-buttons" markdown>
[Download for macOS](installation/macos.md){ .tc-btn .tc-btn-primary }
[Get Started →](usage/getting-started.md){ .tc-btn .tc-btn-secondary }
</div>

<div class="tc-hero-badges" markdown>
[![Release](https://img.shields.io/github/v/release/OWNER/token-companion?style=flat-square&logo=github)](https://github.com/OWNER/token-companion/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/OWNER/token-companion/build.yml?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/OWNER/token-companion/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://github.com/OWNER/token-companion/blob/main/LICENSE)
[![Docs](https://img.shields.io/badge/docs-online-8b5cf6?style=flat-square&logo=readthedocs&logoColor=white)](https://OWNER.github.io/token-companion)
</div>

<div class="tc-hero-agents" markdown>
Works with **Claude CLI** &nbsp;·&nbsp; **Claude Desktop** &nbsp;·&nbsp; **VS Code** &nbsp;·&nbsp; **Codex CLI**
</div>

</div>

<div class="tc-shot" markdown>
![Token Companion — sessions view](assets/scr-sessions.jpg)
</div>

<div class="tc-features" markdown>

<div class="tc-feature-card" markdown>
### 100% local
Your session data never leaves your machine. No accounts, no telemetry, no cloud sync.
</div>

<div class="tc-feature-card" markdown>
### Exact token counts
Reads the real `usage` records written to disk — not estimates. Input, output, cache-read, cache-write, reasoning.
</div>

<div class="tc-feature-card" markdown>
### Editable pricing
Per-MTok rates and cache multipliers, editable per model. Changes persist across restarts.
</div>

<div class="tc-feature-card" markdown>
### Multi-agent in one view
Claude CLI, Desktop, VS Code extension, and Codex CLI — all aggregated and comparable.
</div>

<div class="tc-feature-card" markdown>
### Session drilldown
Expand any session to see every conversation turn, tool call, and thinking block with its token breakdown.
</div>

<div class="tc-feature-card" markdown>
### Instant rescan
Re-reads all session files on demand — no restart needed after a long coding session.
</div>

</div>

## What it reads

| Source | Location |
|---|---|
| Claude CLI + Claude Desktop agent modes + VS Code | `~/.claude/projects/**/*.jsonl` |
| Claude title-generation logs | `~/Library/Application Support/Claude-3p/title-gen/**/*.jsonl` |
| Codex CLI sessions | `~/.codex/sessions/**/*.jsonl` |
| Claude / Codex Desktop chat (discovery only) | Binary stores — conversation count shown, no token data yet |

!!! tip "Privacy first"
    Token Companion never makes network requests. All scanning and cost aggregation runs locally in the Electron main process — nothing is sent anywhere.

---

## Download

[macOS (.dmg)](installation/macos.md){ .md-button .md-button--primary }
[Windows (.exe)](installation/windows.md){ .md-button }
[Linux (.AppImage)](installation/linux.md){ .md-button }
