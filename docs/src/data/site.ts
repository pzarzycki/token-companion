import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const siteName = "Token Companion";
export const siteDescription =
  "Desktop app that reads local Claude and Codex usage records, applies editable pricing, and keeps the session evidence behind each total inspectable.";

export const repoUrl = "https://github.com/pzarzycki/token-companion";
export const releasesUrl = `${repoUrl}/releases/latest`;
export const actionsUrl = `${repoUrl}/actions`;
export const buildWorkflowUrl = `${repoUrl}/actions/workflows/build.yml`;
export const licenseUrl = `${repoUrl}/blob/main/LICENSE`;

function readReleasePackageVersion() {
  const candidates = [resolve(process.cwd(), "package.json"), resolve(process.cwd(), "..", "package.json")];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string; version?: string };
    if (parsed.name === "token-companion-desktop" && parsed.version) {
      return parsed.version;
    }
  }

  throw new Error("Could not resolve the Token Companion release version from package.json.");
}

const packageJson = { version: readReleasePackageVersion() };
export const releaseVersion = packageJson.version;
export const latestTag = `v${releaseVersion}`;
export const releaseDownloadsBaseUrl = `${repoUrl}/releases/download/${latestTag}`;
export const checksumUrl = `${releaseDownloadsBaseUrl}/SHA256SUMS`;

export const featureCards = [
  {
    title: "Reads files on disk",
    body: "Uses usage fields written by Claude and Codex instead of estimating totals from a partial chat view.",
  },
  {
    title: "Keeps source attached",
    body: "Each session keeps its source, model list, and working directory so totals stay tied to a concrete run.",
  },
  {
    title: "Shows gaps instead of guessing",
    body: "If a store does not expose token usage, the app leaves the gap visible instead of inventing a cost.",
  },
  {
    title: "Keeps parser rules explicit",
    body: "Counting rules stay visible, including dedup behavior and how cumulative session totals are selected.",
  },
  {
    title: "Keeps pricing editable",
    body: "Input, output, cache-read, and cache-write prices can be corrected per model from the app.",
  },
  {
    title: "Handles mixed tool use",
    body: "Claude CLI, Claude Desktop Cowork/agent modes, VS Code, and Codex CLI records can be viewed in one place.",
  },
] as const;

export const walkthrough = [
  {
    eyebrow: "Sessions",
    title: "Session attribution",
    body: "The session list keeps agent source, model, cost, and working directory together so totals can be traced back to a concrete run.",
    points: [
      "Useful when several repos share one machine.",
      "Global filters narrow the list by date and source.",
    ],
    image: "/scr-sessions.jpg",
    alt: "Token Companion sessions view",
  },
  {
    eyebrow: "Drilldown",
    title: "Per-session details",
    body: "A session detail view shows how token usage accumulated across conversation entries, including thinking, tool-use, and tool-result blocks where the records expose them.",
    points: [
      "Claude replay duplicates are deduplicated on message id.",
      "Codex cumulative totals come from the last session event.",
    ],
    image: "/scr-drill-down.jpg",
    alt: "Token Companion session drilldown",
  },
  {
    eyebrow: "Models",
    title: "Model totals",
    body: "The model table ranks cost and keeps token classes separate so missing prices and expensive models are easy to spot.",
    points: [
      "Token classes stay distinct.",
      "Missing or unverified prices remain visible.",
    ],
    image: "/scr-models.jpg",
    alt: "Token Companion models table",
  },
  {
    eyebrow: "Pricing",
    title: "Editable rate card",
    body: "Pricing can be corrected in place when model names or provider prices change.",
    points: [
      "Per-model rate cards persist across restarts.",
      "Unverified pricing can be marked before totals are trusted.",
    ],
    image: "/scr-pricing.jpg",
    alt: "Token Companion pricing editor",
  },
] as const;

export const sourceRows = [
  {
    source: "Claude CLI, Claude Desktop agent modes, and VS Code",
    location: "~/.claude/projects/**/*.jsonl",
    tokenData: "Per-message usage records",
  },
  {
    source: "Claude 1p Cowork sessions",
    location: "~/Library/Application Support/Claude/local-agent-mode-sessions/**/audit.jsonl",
    tokenData: "Result usage and exact reported cost",
  },
  {
    source: "Claude 3p title-generation logs",
    location: "~/Library/Application Support/Claude-3p/title-gen/**/*.jsonl",
    tokenData: "Usage records",
  },
  {
    source: "Codex CLI sessions",
    location: "~/.codex/sessions/**/*.jsonl",
    tokenData: "Last cumulative token snapshot per session",
  },
  {
    source: "Claude and Codex desktop plain chat stores",
    location: "IndexedDB / LevelDB stores on disk",
    tokenData: "Conversation discovery only, no token counts exposed",
  },
] as const;

export const platformCards = [
  {
    id: "macos",
    name: "macOS",
    packageType: "Direct, npx, or script",
    note: "Install instructions include the unsigned DMG, the npx bootstrapper, and the install.sh wrapper script.",
  },
  {
    id: "windows",
    name: "Windows",
    packageType: "Direct, npx, or script",
    note: "Install instructions include the unsigned installer, the npx bootstrapper, and the install.ps1 wrapper script.",
  },
  {
    id: "linux",
    name: "Linux",
    packageType: "Direct, npx, or script",
    note: "Install instructions include release packages, the npx bootstrapper, and the install.sh wrapper script.",
  },
] as const;
