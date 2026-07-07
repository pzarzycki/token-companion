import { basename, dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { UsageRecord } from '@shared/types'
import { readJsonlObjects, num, str } from './jsonlReader'

interface CoworkMetadata {
  sessionId?: string
  cliSessionId?: string
  cwd?: string
  model?: string
  title?: string
  createdAt?: number
  lastActivityAt?: number
}

interface AssistantCandidate {
  linkKey: string
  model: string
  timestamp: string
  usage: Record<string, unknown>
}

function isoFromMillis(ms: unknown): string | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return undefined
  return new Date(ms).toISOString()
}

function usageTokens(usage: Record<string, unknown>): {
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  cacheWrite5m: number
  cacheWrite1h: number
} {
  const cacheCreation = usage.cache_creation as Record<string, unknown> | undefined
  return {
    inputTokens: num(usage.input_tokens),
    outputTokens: num(usage.output_tokens),
    cacheWriteTokens: num(usage.cache_creation_input_tokens),
    cacheReadTokens: num(usage.cache_read_input_tokens),
    cacheWrite5m: num(cacheCreation?.ephemeral_5m_input_tokens),
    cacheWrite1h: num(cacheCreation?.ephemeral_1h_input_tokens)
  }
}

function modelUsageTokens(usage: Record<string, unknown>): {
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  cacheWrite5m: number
  cacheWrite1h: number
} {
  const cacheCreation = usage.cache_creation as Record<string, unknown> | undefined
  return {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    cacheWriteTokens: num(usage.cacheCreationInputTokens),
    cacheReadTokens: num(usage.cacheReadInputTokens),
    cacheWrite5m: num(cacheCreation?.ephemeral_5m_input_tokens),
    cacheWrite1h: num(cacheCreation?.ephemeral_1h_input_tokens)
  }
}

async function readMetadata(auditPath: string): Promise<CoworkMetadata> {
  const sessionDir = dirname(auditPath)
  const metadataPath = join(dirname(sessionDir), `${basename(sessionDir)}.json`)
  try {
    const raw = await fs.readFile(metadataPath, 'utf8')
    const obj = JSON.parse(raw) as Record<string, unknown>
    return {
      sessionId: str(obj.sessionId),
      cliSessionId: str(obj.cliSessionId),
      cwd: str(obj.cwd),
      model: str(obj.model),
      title: str(obj.title),
      createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : undefined,
      lastActivityAt: typeof obj.lastActivityAt === 'number' ? obj.lastActivityAt : undefined
    }
  } catch {
    return {}
  }
}

function fallbackSessionId(filePath: string): string {
  return basename(dirname(filePath))
}

function makeRecord(params: {
  filePath: string
  sessionId: string
  metadata: CoworkMetadata
  model: string
  timestamp: string
  tokens: ReturnType<typeof usageTokens>
  actualCostUsd?: number
  linkKey: string
  dedupKey: string
  subagentCount?: number
}): UsageRecord {
  return {
    source: 'claude',
    subSource: 'claude-cowork',
    provider: 'anthropic',
    sessionId: params.sessionId,
    model: params.model,
    timestamp: params.timestamp,
    ...params.tokens,
    reasoningTokens: 0,
    cwd: params.metadata.cwd,
    sessionTitle: params.metadata.title,
    filePath: params.filePath,
    actualCostUsd: params.actualCostUsd,
    conversationRequestId: params.linkKey,
    subagentCount: params.subagentCount,
    dedupKey: params.dedupKey
  }
}

/**
 * Parse Claude 1p Cowork audit traces. The final `result` event carries the
 * authoritative usage/cost; assistant streaming chunks are fallback only.
 */
export async function parseClaudeCoworkFile(filePath: string): Promise<UsageRecord[]> {
  const metadata = await readMetadata(filePath)
  const localSessionId = metadata.sessionId ?? fallbackSessionId(filePath)
  const fallbackTimestamp =
    isoFromMillis(metadata.lastActivityAt) ?? isoFromMillis(metadata.createdAt) ?? new Date(0).toISOString()

  const assistantByLink = new Map<string, AssistantCandidate>()
  let lastAssistantLink: string | undefined
  const resultRecords: UsageRecord[] = []
  const taskIds = new Set<string>()

  for await (const obj of readJsonlObjects(filePath)) {
    if (str(obj.subtype) === 'task_started') {
      const taskId = str(obj.task_id)
      if (taskId) taskIds.add(taskId)
    }

    if (obj.type === 'assistant') {
      const message = obj.message as Record<string, unknown> | undefined
      if (!message || typeof message !== 'object') continue
      const usage = message.usage as Record<string, unknown> | undefined
      if (!usage || typeof usage !== 'object') continue

      const linkKey = str(message.id) ?? str(obj.request_id) ?? str(obj.requestId) ?? str(obj.uuid)
      if (!linkKey) continue
      lastAssistantLink = linkKey
      assistantByLink.set(linkKey, {
        linkKey,
        model: str(message.model) ?? metadata.model ?? 'unknown',
        timestamp: str(obj.timestamp) ?? fallbackTimestamp,
        usage
      })
      continue
    }

    if (obj.type !== 'result') continue
    const result = obj as Record<string, unknown>
    const linkKey = lastAssistantLink ?? str(result.uuid) ?? `${localSessionId}:${resultRecords.length}`
    const timestamp = str(result.timestamp) ?? fallbackTimestamp
    const modelUsage = result.modelUsage as Record<string, unknown> | undefined

    if (modelUsage && typeof modelUsage === 'object' && Object.keys(modelUsage).length > 0) {
      for (const [model, raw] of Object.entries(modelUsage)) {
        if (!raw || typeof raw !== 'object') continue
        const usage = raw as Record<string, unknown>
        const actualCostUsd = num(usage.costUSD)
        resultRecords.push(
          makeRecord({
            filePath,
            sessionId: localSessionId,
            metadata,
            model,
            timestamp,
            tokens: modelUsageTokens(usage),
            actualCostUsd: actualCostUsd || undefined,
            linkKey,
            dedupKey: Object.keys(modelUsage).length === 1 ? linkKey : `${linkKey}:${model}`,
            subagentCount: taskIds.size || undefined
          })
        )
      }
      continue
    }

    const usage = result.usage as Record<string, unknown> | undefined
    if (!usage || typeof usage !== 'object') continue
    const actualCostUsd = num(result.total_cost_usd)
    resultRecords.push(
      makeRecord({
        filePath,
        sessionId: localSessionId,
        metadata,
        model: metadata.model ?? assistantByLink.get(linkKey)?.model ?? 'unknown',
        timestamp,
        tokens: usageTokens(usage),
        actualCostUsd: actualCostUsd || undefined,
        linkKey,
        dedupKey: linkKey,
        subagentCount: taskIds.size || undefined
      })
    )
  }

  if (resultRecords.length > 0) return resultRecords

  return [...assistantByLink.values()].map((candidate, i) =>
    makeRecord({
      filePath,
      sessionId: localSessionId,
      metadata,
      model: candidate.model,
      timestamp: candidate.timestamp,
      tokens: usageTokens(candidate.usage),
      linkKey: candidate.linkKey,
      dedupKey: candidate.linkKey || `${localSessionId}:${i}`,
      subagentCount: taskIds.size || undefined
    })
  )
}
