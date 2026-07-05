# Getting Started

## First launch

After installing Token Companion, open the app. The **Dashboard** tab loads immediately and scanning begins in the background — you'll see a **"Scanning…"** indicator in the header.

Scanning is read-only and typically finishes in a few seconds, even with hundreds of session files.

## What is being scanned

Token Companion looks for `.jsonl` session files written by AI coding agents on your machine:

| Source | Location |
|---|---|
| Claude CLI + Desktop agent + VS Code | `~/.claude/projects/**/*.jsonl` |
| Claude title-generation | `~/Library/Application Support/Claude-3p/title-gen/**/*.jsonl` |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` |

It also probes for Claude and Codex Desktop chat stores (LevelDB/IndexedDB) to report how many conversations exist — but those binary formats don't contain token usage fields, so they appear as an "untracked" count rather than a cost figure.

!!! tip
    If you run Claude or Codex in a non-standard location, the app may not pick up those sessions automatically. Standard installs are detected without any configuration.

## Reading the Dashboard

Once scanning completes, the Dashboard shows:

**Summary cards** at the top — Total Cost, Total Tokens, Sessions counted, and Models seen. If some models have no pricing entry, Total Cost is a partial figure (those models show $0.00).

**Timeline chart** — token and cost spend plotted over time. Hover any bar to see the breakdown for that period.

**Untracked Conversations** panel — if Claude or Codex Desktop is installed, this shows how many conversations were detected in the binary stores. These cannot be counted yet (the stores have no usage records), but the count gives a sense of the gap.

**Filter bar** — date range presets (Last 7 days, Last 30 days, All time) and source chips (claude, claude-3p, codex). Selecting a chip filters every view to that source only.

## Tabs overview

| Tab | What it shows |
|---|---|
| **Dashboard** | Summary cards, cost/token timeline |
| **Models** | Per-model token and cost table, sorted by spend |
| **Sessions** | Individual sessions with expandable conversation entries |
| **Pricing** | Editable per-model rates ($/MTok input, output, cache) |

## Rescanning

Click **↻ Rescan** in the header to re-read all session files and refresh every figure. Do this after a long coding session to pick up new usage without restarting the app.

---

Next: [Features →](features.md)
