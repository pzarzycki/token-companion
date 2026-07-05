export const siteName = "Token Companion";
export const siteDescription =
  "Local, privacy-first desktop app that reads exact token usage from Claude and Codex sessions and maps it to editable pricing.";

export const repoUrl = "https://github.com/pzarzycki/token-companion";
export const releasesUrl = `${repoUrl}/releases/latest`;
export const actionsUrl = `${repoUrl}/actions`;
export const buildWorkflowUrl = `${repoUrl}/actions/workflows/build.yml`;
export const licenseUrl = `${repoUrl}/blob/main/LICENSE`;

export const featureCards = [
  {
    title: "Reads the real records",
    body: "Counts the usage fields already written to disk instead of estimating spend from prompts and replies.",
  },
  {
    title: "Pricing stays editable",
    body: "Per-model input, output, cache-read, and cache-write pricing can be corrected in the app without rebuilding anything.",
  },
  {
    title: "Sessions stay traceable",
    body: "Every session keeps its source, model, and working directory so spend can be tied back to the project that caused it.",
  },
  {
    title: "Built for mixed agent workflows",
    body: "Claude CLI, Claude Desktop agent modes, VS Code, and Codex CLI can be viewed together instead of in isolated logs.",
  },
  {
    title: "Fast rescans, no restarts",
    body: "Long coding day? Hit rescan and the app re-reads fresh session files without throwing away your current filters.",
  },
  {
    title: "Local by default",
    body: "Scanning, aggregation, and cost calculation all happen on your machine. No account, no telemetry, no cloud sync.",
  },
] as const;

export const walkthrough = [
  {
    eyebrow: "Models",
    title: "See which model families are actually driving spend.",
    body: "The model table keeps token classes separate and ranks spend so pricing mistakes or a runaway model stand out immediately.",
    points: [
      "Input, output, cache-read, cache-write, and reasoning tokens stay distinct.",
      "Missing pricing entries are visible instead of being hidden behind estimates.",
    ],
    image: "/scr-models.jpg",
    alt: "Token Companion models table",
  },
  {
    eyebrow: "Sessions",
    title: "Trace the cost back to the session and the project folder.",
    body: "Session view keeps the operational context intact, including the agent source, top model, total cost, and the cwd where the run happened.",
    points: [
      "Useful when multiple repos or experiments share the same local machine.",
      "Filters stay global, so the list updates instantly when you narrow by date or source.",
    ],
    image: "/scr-sessions.jpg",
    alt: "Token Companion sessions view",
  },
  {
    eyebrow: "Drilldown",
    title: "Open a single session and inspect how the conversation accumulated cost.",
    body: "Conversation entries expose the per-turn token breakdown so you can see where tool calls, assistant replies, and reasoning blocks added up.",
    points: [
      "Claude replay duplicates are deduplicated on message id.",
      "Codex cumulative session totals are taken from the last event, not summed blindly.",
    ],
    image: "/scr-drill-down.jpg",
    alt: "Token Companion session drilldown",
  },
  {
    eyebrow: "Pricing",
    title: "Correct the rate card instead of living with stale defaults.",
    body: "Pricing is editable in place, which matters when model names drift or a provider changes token pricing before your local defaults catch up.",
    points: [
      "Per-model rate cards persist across restarts.",
      "Good for verifying placeholder OpenAI or Codex pricing before trusting totals.",
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
    packageType: ".dmg",
    note: "Unsigned first launch. Right-click Open once or clear quarantine from Terminal.",
  },
  {
    id: "windows",
    name: "Windows",
    packageType: "Setup.exe",
    note: "Squirrel installer. SmartScreen will ask you to confirm the first run until the app is signed.",
  },
  {
    id: "linux",
    name: "Linux",
    packageType: ".deb / .rpm",
    note: "Native distro packages when available, with source build instructions as a fallback.",
  },
] as const;
