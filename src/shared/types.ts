// Shared types used by both the Electron main process and the React renderer.

export type Provider = 'anthropic' | 'openai'

/**
 * A source of usage data. Sub-source distinguishes variants that share a
 * storage location (e.g. Claude CLI vs Claude Desktop agent mode, both in
 * ~/.claude/projects, told apart by the `entrypoint` field).
 */
export type SourceId = 'claude' | 'claude-3p' | 'codex'

/** One normalized usage record. Claude → one per assistant message; Codex → one per session. */
export interface UsageRecord {
  source: SourceId
  /** Finer label, e.g. 'cli' | 'claude-desktop' | 'claude-desktop-3p' | 'claude-vscode' | 'codex-cli'. */
  subSource: string
  provider: Provider
  sessionId: string
  model: string
  /** ISO 8601. */
  timestamp: string
  inputTokens: number
  outputTokens: number
  /** Total cache-creation (write) tokens. */
  cacheWriteTokens: number
  cacheReadTokens: number
  /** Ephemeral 5-minute cache-write tokens (subset of cacheWriteTokens). */
  cacheWrite5m: number
  /** Ephemeral 1-hour cache-write tokens (subset of cacheWriteTokens). */
  cacheWrite1h: number
  /** Reasoning/thinking output tokens (Codex reasoning_output_tokens). */
  reasoningTokens: number
  cwd?: string
  /** Optional display title when the source has a session metadata file. */
  sessionTitle?: string
  filePath: string
  /** Exact source-reported USD cost, used before pricing-table estimates. */
  actualCostUsd?: number
  /** Transcript entry key when it differs from the billing dedupe key. */
  conversationRequestId?: string
  /** Stable identity for dedup (Claude message.id / requestId; Codex session id). */
  dedupKey: string
}

export interface PricingEntry {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
  /** Optional display name. */
  label?: string
  /** Flags rates that are placeholders needing confirmation (e.g. OpenAI models). */
  verify?: boolean
  /** Optional note (e.g. intro pricing window). */
  note?: string
}

export interface PricingTable {
  /** Multipliers applied to the model's input rate for cache activity. */
  cacheMultipliers: {
    read: number
    write5m: number
    write1h: number
  }
  /** Per-model rates, keyed by exact model id. */
  models: Record<string, PricingEntry>
}

/** Token totals, reused at every aggregation level. */
export interface TokenTotals {
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  reasoningTokens: number
  /** Sum of all token categories (rough "size" metric). */
  totalTokens: number
}

export interface CostedTotals extends TokenTotals {
  /** USD; null when the model has no pricing entry. */
  cost: number | null
  /** True if any record in this bucket lacked pricing. */
  hasUnpricedModel: boolean
}

export interface ModelAggregate extends CostedTotals {
  model: string
  provider: Provider
  recordCount: number
  /** True if pricing exists but is flagged verify. */
  pricingUnverified: boolean
}

export interface SessionAggregate extends CostedTotals {
  sessionId: string
  source: SourceId
  subSource: string
  provider: Provider
  models: string[]
  cwd?: string
  firstTimestamp: string
  lastTimestamp: string
  recordCount: number
}

export interface DailyAggregate extends CostedTotals {
  /** YYYY-MM-DD. */
  date: string
}

export interface SourceAggregate extends CostedTotals {
  source: SourceId
  subSource: string
  recordCount: number
  sessionCount: number
}

/** A desktop conversation store we can see but can't token-count (v1 gap). */
export interface DesktopGapEntry {
  app: string
  path: string
  /** Best-effort count of conversations found. */
  conversationCount: number
  /** Human note about why it's uncounted. */
  note: string
}

/** One content block inside a conversation entry. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string | ContentBlock[] }
  | { type: 'json'; label: string; value: unknown; defaultOpen?: boolean }
  | { type: 'list'; label: string; items: string[]; defaultOpen?: boolean }
  | { type: 'metric'; label: string; value: string | number }
  | { type: 'unknown'; raw: unknown }

/** A single turn in the conversation (user or assistant). */
export interface ConversationEntry {
  uuid: string
  parentUuid: string | null
  role: 'user' | 'assistant' | 'system' | 'result' | 'event'
  timestamp: string
  content: ContentBlock[]
  /** Only on assistant entries */
  model?: string
  /** Links this entry back to its UsageRecord.dedupKey */
  requestId?: string
  subtype?: string
  title?: string
  raw?: unknown
}

/** Returned by the session:entries IPC channel. */
export interface SessionEntries {
  sessionId: string
  entries: ConversationEntry[]
}

export interface ScanResult {
  records: UsageRecord[]
  desktopGaps: DesktopGapEntry[]
  scannedAt: string
  /** Non-fatal problems (unreadable files, locked DBs, etc.). */
  warnings: string[]
}

/** Filters applied when computing aggregates in the renderer. */
export interface AggregateFilter {
  sources?: SourceId[]
  /** Inclusive ISO date bounds (YYYY-MM-DD). */
  fromDate?: string
  toDate?: string
}

export interface Aggregates {
  overall: CostedTotals
  byModel: ModelAggregate[]
  bySource: SourceAggregate[]
  byDay: DailyAggregate[]
  sessions: SessionAggregate[]
  sessionCount: number
  recordCount: number
}

export interface AppInfo {
  version: string
  repoUrl: string
  hasUpdate: boolean
  latestVersion: string | null
  latestUrl: string
}
