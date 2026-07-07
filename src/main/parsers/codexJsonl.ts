import { basename } from 'node:path'
import type { UsageRecord } from '@shared/types'
import { readJsonlObjects, num, str } from './jsonlReader'

/**
 * Parse a Codex CLI rollout file. Emits ONE UsageRecord per session, built
 * from the LAST `token_count` event — its `total_token_usage` is cumulative
 * across the session (verified on-machine: first=16170 → last=73151 total).
 * Summing token_count events would massively overcount.
 *
 * Shapes (verified on-machine):
 *   { type: "session_meta", payload: { id, session_id, ... }, timestamp }
 *   { type: "turn_context", payload: { model, model_provider, ... }, timestamp }
 *   { type: "event_msg", payload: { type: "token_count",
 *       info: { total_token_usage: { input_tokens, cached_input_tokens,
 *               output_tokens, reasoning_output_tokens, total_tokens } } } }
 */
export async function parseCodexFile(filePath: string): Promise<UsageRecord[]> {
  let sessionId: string | undefined
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined
  let model: string | undefined
  let cwd: string | undefined
  let parentSessionId: string | undefined
  let isSubagent = false
  let agentNickname: string | undefined
  let agentRole: string | undefined
  let subagentDepth: number | undefined
  let lastTotals: {
    input: number
    cached: number
    output: number
    reasoning: number
  } | null = null

  for await (const obj of readJsonlObjects(filePath)) {
    const ts = str(obj.timestamp)
    if (ts) {
      if (!firstTimestamp) firstTimestamp = ts
      lastTimestamp = ts
    }

    const type = obj.type
    const payload = obj.payload as Record<string, unknown> | undefined

    if (type === 'session_meta' && payload) {
      // Prefer the rollout id, else session_id/thread id.
      sessionId = str(payload.id) ?? str(payload.session_id) ?? sessionId
      cwd = str(payload.cwd) ?? cwd
      const source = payload.source as Record<string, unknown> | undefined
      const subagent = source?.subagent as Record<string, unknown> | undefined
      const threadSpawn = subagent?.thread_spawn as Record<string, unknown> | undefined
      if (payload.thread_source === 'subagent' && threadSpawn) {
        parentSessionId = str(threadSpawn.parent_thread_id) ?? str(payload.parent_thread_id)
        isSubagent = Boolean(parentSessionId)
        agentNickname = str(payload.agent_nickname) ?? str(threadSpawn.agent_nickname)
        agentRole = str(payload.agent_role) ?? str(threadSpawn.agent_role)
        const depth = num(threadSpawn.depth)
        subagentDepth = depth || undefined
      }
    } else if (type === 'turn_context' && payload) {
      model = str(payload.model) ?? model
      cwd = str(payload.cwd) ?? cwd
    } else if (type === 'event_msg' && payload && payload.type === 'token_count') {
      const info = payload.info as Record<string, unknown> | undefined
      const total = info?.total_token_usage as Record<string, unknown> | undefined
      if (total) {
        lastTotals = {
          input: num(total.input_tokens),
          cached: num(total.cached_input_tokens),
          output: num(total.output_tokens),
          reasoning: num(total.reasoning_output_tokens)
        }
      }
    }
  }

  if (!lastTotals) return [] // no usage recorded in this rollout

  const fileSession = basename(filePath).replace(/\.jsonl$/, '')
  const resolvedSession = sessionId ?? fileSession

  // In Codex, `input_tokens` in total_token_usage already includes cached input.
  // Split it so cached tokens are priced at the cache-read rate and only the
  // remainder at full input rate.
  const cacheReadTokens = lastTotals.cached
  const inputTokens = Math.max(0, lastTotals.input - lastTotals.cached)

  return [
    {
      source: 'codex',
      subSource: isSubagent ? 'codex-subagent' : 'codex-cli',
      provider: 'openai',
      sessionId: resolvedSession,
      model: model ?? 'unknown',
      timestamp: lastTimestamp ?? firstTimestamp ?? new Date(0).toISOString(),
      inputTokens,
      outputTokens: lastTotals.output,
      cacheWriteTokens: 0, // Codex does not report cache-creation separately
      cacheReadTokens,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      reasoningTokens: lastTotals.reasoning,
      cwd,
      filePath,
      parentSessionId,
      isSubagent: isSubagent || undefined,
      agentNickname,
      agentRole,
      subagentDepth,
      dedupKey: `codex:${resolvedSession}`
    }
  ]
}
