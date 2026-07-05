export const siteName = "Token Companion";
export const siteDescription =
  "Desktop app that reads local Claude and Codex usage records, applies editable pricing, and shows cost by model, session, and project.";

export const repoUrl = "https://github.com/pzarzycki/token-companion";
export const releasesUrl = `${repoUrl}/releases/latest`;
export const actionsUrl = `${repoUrl}/actions`;
export const buildWorkflowUrl = `${repoUrl}/actions/workflows/build.yml`;
export const licenseUrl = `${repoUrl}/blob/main/LICENSE`;

export const featureCards = [
  {
    title: "Reads files on disk",
    body: "Uses the usage fields written by Claude and Codex instead of estimating cost from visible prompts and replies.",
  },
  {
    title: "Keeps pricing editable",
    body: "Input, output, cache-read, and cache-write prices can be adjusted per model from the app.",
  },
  {
    title: "Keeps the source attached",
    body: "Each session keeps its source, model list, and working directory so cost can be tied back to a repo or experiment.",
  },
  {
    title: "Handles mixed tool use",
    body: "Claude CLI, Claude Desktop agent modes, VS Code, and Codex CLI records can be viewed in one place.",
  },
  {
    title: "Separates token classes",
    body: "Input, output, cache-read, cache-write, and reasoning tokens stay separate in the model and session views.",
  },
  {
    title: "Does not upload sessions",
    body: "Scanning, aggregation, and cost calculation run locally. There is no account, telemetry, or cloud sync.",
  },
] as const;

export const walkthrough = [
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
    eyebrow: "Sessions",
    title: "Session attribution",
    body: "The session list keeps the agent source, model, cost, and working directory together.",
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
    body: "A session detail view shows how token usage accumulated across conversation entries.",
    points: [
      "Claude replay duplicates are deduplicated on message id.",
      "Codex cumulative totals come from the last session event.",
    ],
    image: "/scr-drill-down.jpg",
    alt: "Token Companion session drilldown",
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
    packageType: "npx source build",
    note: "Run the npx installer, which builds locally and copies Token Companion.app to ~/Applications by default.",
  },
  {
    id: "windows",
    name: "Windows",
    packageType: "npx source build",
    note: "Run the npx installer, which builds a local NSIS installer and runs a per-user install with Start Menu and uninstall support.",
  },
  {
    id: "linux",
    name: "Linux",
    packageType: "npx source build",
    note: "Run the npx installer, which builds native .deb and .rpm packages and installs the matching package.",
  },
] as const;
