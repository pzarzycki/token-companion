import { basename } from 'node:path'
import type { UsageRecord, SourceId } from '@shared/types'
import { readJsonlObjects, num, str } from './jsonlReader'

/**
 * Parse a Claude JSONL transcript. Emits one UsageRecord per `assistant`
 * message that carries a `usage` block. Usage is per-message and summed later.
 *
 * Shape (verified on-machine):
 *   { type: "assistant",
 *     message: { model, id, usage: { input_tokens, output_tokens,
 *                cache_creation_input_tokens, cache_read_input_tokens,
 *                cache_creation: { ephemeral_5m_input_tokens, ephemeral_1h_input_tokens } } },
 *     timestamp, sessionId, entrypoint, cwd, requestId }
 */
export async function parseClaudeFile(
  filePath: string,
  source: SourceId
): Promise<UsageRecord[]> {
  const records: UsageRecord[] = []
  // Fallback session id: the file is named <sessionUuid>.jsonl.
  const fileSession = basename(filePath).replace(/\.jsonl$/, '')

  for await (const obj of readJsonlObjects(filePath)) {
    if (obj.type !== 'assistant') continue
    const message = obj.message as Record<string, unknown> | undefined
    if (!message || typeof message !== 'object') continue
    const usage = message.usage as Record<string, unknown> | undefined
    if (!usage || typeof usage !== 'object') continue

    const model = str(message.model) ?? 'unknown'
    // Skip synthetic/no-op title-gen entries with a placeholder model and zero usage.
    const inputTokens = num(usage.input_tokens)
    const outputTokens = num(usage.output_tokens)
    const cacheWriteTokens = num(usage.cache_creation_input_tokens)
    const cacheReadTokens = num(usage.cache_read_input_tokens)
    if (
      model === '<synthetic>' &&
      inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens === 0
    ) {
      continue
    }

    const cacheCreation = usage.cache_creation as Record<string, unknown> | undefined
    const cacheWrite5m = num(cacheCreation?.ephemeral_5m_input_tokens)
    const cacheWrite1h = num(cacheCreation?.ephemeral_1h_input_tokens)

    const entrypoint = str(obj.entrypoint) ?? 'unknown'
    const sessionId = str(obj.sessionId) ?? fileSession
    const timestamp = str(obj.timestamp) ?? new Date(0).toISOString()
    const cwd = str(obj.cwd)

    // Dedup identity: message.id is stable across session resumes; fall back to requestId, then a positional key.
    const messageId = str(message.id)
    const requestId = str(obj.requestId)
    const dedupKey = messageId ?? requestId ?? `${sessionId}:${timestamp}:${records.length}`

    // Records from ~/.claude/projects with entrypoint 'claude-desktop-3p' belong to Claude 3p Desktop.
    const resolvedSource: SourceId =
      source === 'claude' && entrypoint === 'claude-desktop-3p' ? 'claude-3p' : source

    records.push({
      source: resolvedSource,
      subSource: entrypoint,
      provider: 'anthropic',
      sessionId,
      model,
      timestamp,
      inputTokens,
      outputTokens,
      cacheWriteTokens,
      cacheReadTokens,
      cacheWrite5m,
      cacheWrite1h,
      reasoningTokens: 0,
      cwd,
      filePath,
      dedupKey
    })
  }
  return records
}
