import type { ContentBlock, ConversationEntry, SessionEntries, SubagentTrace } from '@shared/types'
import { num, readJsonlObjects, str } from './jsonlReader'
import { isJsonl, sourcePaths, walkFiles } from '../sources'

const LONG_TEXT_THRESHOLD = 1200

function compactPreview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function textBlock(text: string, label = 'Text', defaultOpen = true): ContentBlock {
  if (text.length <= LONG_TEXT_THRESHOLD) return { type: 'text', text }
  return { type: 'long_text', label, text, preview: compactPreview(text), defaultOpen }
}

function jsonBlock(label: string, value: unknown, defaultOpen = false): ContentBlock {
  return { type: 'json', label, value, defaultOpen }
}

function metricBlock(label: string, value: string | number): ContentBlock {
  return { type: 'metric', label, value }
}

/**
 * Extract readable text from a Codex Responses-API content array. Codex uses
 * `input_text` (user/developer turns) and `output_text` (assistant turns),
 * unlike Claude's `text`. Each becomes a text ContentBlock.
 */
function textBlocks(raw: unknown, longLabel = 'Text', defaultOpen = true): ContentBlock[] {
  if (typeof raw === 'string') return raw ? [textBlock(raw, longLabel, defaultOpen)] : []
  if (!Array.isArray(raw)) return []
  const blocks: ContentBlock[] = []
  for (const part of raw) {
    if (!part || typeof part !== 'object') continue
    const p = part as Record<string, unknown>
    const t = p.type
    if ((t === 'input_text' || t === 'output_text' || t === 'text') && typeof p.text === 'string') {
      blocks.push(textBlock(p.text, longLabel, defaultOpen))
    } else if (t === 'input_image') {
      blocks.push(jsonBlock('Image input', p))
    }
  }
  return blocks
}

/** Best-effort pretty-print of a tool-call argument string (usually JSON). */
function parseToolInput(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function summaryText(raw: unknown): string {
  if (!Array.isArray(raw)) return ''
  return raw
    .map((s) => {
      if (typeof s === 'string') return s
      if (s && typeof s === 'object' && typeof (s as Record<string, unknown>).text === 'string') {
        return (s as Record<string, unknown>).text as string
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function extractContentText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (!Array.isArray(raw)) return ''
  return raw
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const p = part as Record<string, unknown>
      return typeof p.text === 'string' ? p.text : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function codexEntry(params: {
  role: ConversationEntry['role']
  timestamp: string
  content: ContentBlock[]
  subtype: string
  title?: string
  raw?: unknown
}): ConversationEntry {
  return {
    uuid: '',
    parentUuid: null,
    role: params.role,
    timestamp: params.timestamp,
    content: params.content,
    subtype: params.subtype,
    title: params.title,
    raw: params.raw
  }
}

function parseTokenUsage(info: Record<string, unknown> | undefined): ContentBlock[] {
  const total = info?.total_token_usage as Record<string, unknown> | undefined
  const last = info?.last_token_usage as Record<string, unknown> | undefined
  const blocks: ContentBlock[] = []
  if (total) {
    blocks.push(metricBlock('Total tokens', num(total.total_tokens)))
    blocks.push(metricBlock('Input', num(total.input_tokens)))
    blocks.push(metricBlock('Cached input', num(total.cached_input_tokens)))
    blocks.push(metricBlock('Output', num(total.output_tokens)))
    blocks.push(metricBlock('Reasoning output', num(total.reasoning_output_tokens)))
  }
  if (last) blocks.push(jsonBlock('Last token usage', last))
  return blocks
}

interface CodexSubagentCandidate {
  filePath: string
  agentId: string
  parentSessionId: string
  nickname?: string
  role?: string
  depth?: number
  firstTimestamp: string
  lastTimestamp: string
  status?: string
  progressCount: number
  stepCount: number
  models: string[]
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  reasoningTokens: number
  promptPreview?: string
}

function previewText(text: string | undefined): string | undefined {
  if (!text) return undefined
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized
}

function updateRange(candidate: CodexSubagentCandidate, timestamp: string | undefined): void {
  if (!timestamp) return
  if (!candidate.firstTimestamp || timestamp < candidate.firstTimestamp) candidate.firstTimestamp = timestamp
  if (!candidate.lastTimestamp || timestamp > candidate.lastTimestamp) candidate.lastTimestamp = timestamp
}

async function summarizeCodexSubagentFile(filePath: string): Promise<CodexSubagentCandidate | null> {
  let candidate: CodexSubagentCandidate | null = null
  const models = new Set<string>()

  for await (const obj of readJsonlObjects(filePath)) {
    const payload = obj.payload as Record<string, unknown> | undefined
    const timestamp = str(obj.timestamp)

    if (obj.type === 'session_meta' && payload) {
      const source = payload.source as Record<string, unknown> | undefined
      const subagent = source?.subagent as Record<string, unknown> | undefined
      const threadSpawn = subagent?.thread_spawn as Record<string, unknown> | undefined
      const parentSessionId = str(threadSpawn?.parent_thread_id) ?? str(payload.parent_thread_id)
      const agentId = str(payload.id)
      if (payload.thread_source !== 'subagent' || !threadSpawn || !parentSessionId || !agentId) {
        return null
      }
      candidate = {
        filePath,
        agentId,
        parentSessionId,
        nickname: str(payload.agent_nickname) ?? str(threadSpawn.agent_nickname),
        role: str(payload.agent_role) ?? str(threadSpawn.agent_role),
        depth: num(threadSpawn.depth) || undefined,
        firstTimestamp: timestamp ?? str(payload.timestamp) ?? '',
        lastTimestamp: timestamp ?? str(payload.timestamp) ?? '',
        progressCount: 0,
        stepCount: 0,
        models: [],
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        reasoningTokens: 0
      }
      continue
    }

    if (!candidate) continue
    updateRange(candidate, timestamp)

    if (obj.type === 'turn_context' && payload) {
      const model = str(payload.model)
      if (model) models.add(model)
      continue
    }

    if (obj.type === 'event_msg' && payload) {
      const eventType = str(payload.type)
      if (eventType === 'user_message') {
        candidate.promptPreview = candidate.promptPreview ?? previewText(str(payload.message))
      } else if (eventType === 'token_count') {
        candidate.progressCount += 1
        const info = payload.info as Record<string, unknown> | undefined
        const total = info?.total_token_usage as Record<string, unknown> | undefined
        if (total) {
          const input = num(total.input_tokens)
          const cached = num(total.cached_input_tokens)
          candidate.inputTokens = Math.max(0, input - cached)
          candidate.cacheReadTokens = cached
          candidate.outputTokens = num(total.output_tokens)
          candidate.reasoningTokens = num(total.reasoning_output_tokens)
        }
      } else if (eventType === 'task_complete') {
        candidate.status = 'completed'
      }
      continue
    }

    if (obj.type === 'response_item' && payload) {
      candidate.stepCount += 1
    }
  }

  if (!candidate) return null
  candidate.models = [...models]
  return candidate
}

async function parseCodexSubagents(parentSessionId: string): Promise<SubagentTrace[]> {
  const files = await walkFiles(sourcePaths().codexSessions, isJsonl)
  const candidates: CodexSubagentCandidate[] = []

  for (const filePath of files) {
    const candidate = await summarizeCodexSubagentFile(filePath)
    if (candidate?.parentSessionId === parentSessionId) candidates.push(candidate)
  }

  const subagents: SubagentTrace[] = []
  for (const candidate of candidates) {
    const parsed = await parseCodexSessionEntries(candidate.filePath, candidate.agentId, {
      includeSubagents: false
    })
    subagents.push({
      source: 'codex',
      agentId: candidate.agentId,
      taskId: candidate.agentId,
      parentSessionId: candidate.parentSessionId,
      description: candidate.nickname,
      subagentType: candidate.role,
      taskType: 'thread_spawn',
      promptPreview: candidate.promptPreview,
      firstTimestamp: candidate.firstTimestamp,
      lastTimestamp: candidate.lastTimestamp,
      status: candidate.status,
      progressCount: candidate.progressCount,
      stepCount: candidate.stepCount,
      models: candidate.models,
      inputTokens: candidate.inputTokens,
      outputTokens: candidate.outputTokens,
      cacheWriteTokens: 0,
      cacheReadTokens: candidate.cacheReadTokens,
      reasoningTokens: candidate.reasoningTokens,
      entries: parsed.entries
    })
  }

  subagents.sort((a, b) => a.firstTimestamp.localeCompare(b.firstTimestamp))
  return subagents
}

/**
 * Parse a Codex CLI rollout file into conversation entries. Codex stores the
 * conversation as `response_item` records in OpenAI Responses format — a
 * different schema from Claude's `user`/`assistant` records, so it needs its
 * own parser. Shapes (verified on-machine):
 *   { type: "response_item", payload: { type: "message", role, content: [...] } }
 *   { type: "response_item", payload: { type: "reasoning", summary, encrypted_content } }
 *   { type: "response_item", payload: { type: "function_call", name, arguments, call_id } }
 *   { type: "response_item", payload: { type: "function_call_output", call_id, output } }
 *   (also custom_tool_call / custom_tool_call_output with name/input/output)
 *
 * Entries are emitted in file order (Codex records are already sequential).
 */
export async function parseCodexSessionEntries(
  filePath: string,
  sessionId: string,
  options: { includeSubagents?: boolean } = {}
): Promise<SessionEntries> {
  const entries: ConversationEntry[] = []

  for await (const obj of readJsonlObjects(filePath)) {
    const timestamp = str(obj.timestamp) ?? ''

    if (obj.type === 'session_meta') {
      const payload = obj.payload as Record<string, unknown> | undefined
      if (!payload || typeof payload !== 'object') continue
      entries.push(
        codexEntry({
          role: 'system',
          timestamp,
          subtype: 'codex-session-meta',
          title: 'Session metadata',
          content: [
            metricBlock('Originator', str(payload.originator) ?? 'unknown'),
            metricBlock('CLI version', str(payload.cli_version) ?? 'unknown'),
            metricBlock('CWD', str(payload.cwd) ?? 'unknown'),
            jsonBlock('Base instructions', payload.base_instructions),
            jsonBlock('Dynamic tools', payload.dynamic_tools),
            jsonBlock('Raw event', obj)
          ],
          raw: obj
        })
      )
      continue
    }

    if (obj.type === 'turn_context') {
      const payload = obj.payload as Record<string, unknown> | undefined
      if (!payload || typeof payload !== 'object') continue
      entries.push(
        codexEntry({
          role: 'system',
          timestamp,
          subtype: 'codex-turn-context',
          title: 'Turn context',
          content: [
            metricBlock('Model', str(payload.model) ?? 'unknown'),
            metricBlock('CWD', str(payload.cwd) ?? 'unknown'),
            metricBlock('Approval', str(payload.approval_policy) ?? 'unknown'),
            jsonBlock('Sandbox', payload.sandbox_policy),
            jsonBlock('Collaboration mode', payload.collaboration_mode),
            jsonBlock('Raw event', obj)
          ],
          raw: obj
        })
      )
      continue
    }

    if (obj.type === 'compacted') {
      entries.push(
        codexEntry({
          role: 'event',
          timestamp,
          subtype: 'codex-compacted',
          title: 'Context compacted',
          content: [jsonBlock('Raw event', obj, true)],
          raw: obj
        })
      )
      continue
    }

    if (obj.type === 'event_msg') {
      const payload = obj.payload as Record<string, unknown> | undefined
      if (!payload || typeof payload !== 'object') continue
      const ptype = str(payload.type) ?? 'event'
      if (ptype === 'user_message') {
        const message = str(payload.message) ?? ''
        const content = message ? [textBlock(message, 'User message', true)] : []
        if (payload.images || payload.local_images || payload.text_elements) {
          content.push(jsonBlock('Attachments', {
            images: payload.images,
            local_images: payload.local_images,
            text_elements: payload.text_elements
          }))
        }
        if (content.length) {
          entries.push({
            uuid: '',
            parentUuid: null,
            role: 'user',
            timestamp,
            content,
            subtype: 'codex-user-message',
            raw: obj
          })
        }
      } else if (ptype === 'agent_message') {
        const message = str(payload.message) ?? ''
        if (message) {
          entries.push(codexEntry({
            role: 'event',
            timestamp,
            subtype: 'codex-agent-message',
            title: 'Agent message',
            content: [textBlock(message, 'Agent message', false), jsonBlock('Raw event', obj)],
            raw: obj
          }))
        }
      } else if (ptype === 'token_count') {
        const info = payload.info as Record<string, unknown> | undefined
        entries.push(
          codexEntry({
            role: 'event',
            timestamp,
            subtype: 'codex-token-count',
            title: 'Token count',
            content: [...parseTokenUsage(info), jsonBlock('Raw event', obj)],
            raw: obj
          })
        )
      } else {
        const title = ptype
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        entries.push(
          codexEntry({
            role: ptype === 'task_started' || ptype === 'task_complete' ? 'system' : 'event',
            timestamp,
            subtype: `codex-${ptype}`,
            title,
            content: [jsonBlock('Raw event', obj, false)],
            raw: obj
          })
        )
      }
      continue
    }

    if (obj.type !== 'response_item') continue
    const payload = obj.payload as Record<string, unknown> | undefined
    if (!payload || typeof payload !== 'object') continue

    const ptype = payload.type

    if (ptype === 'message') {
      const role = str(payload.role) ?? 'user'
      const contentText = extractContentText(payload.content)
      if (role === 'developer') {
        const content = textBlocks(payload.content, 'Developer context', false)
        if (content.length === 0) continue
        entries.push(
          codexEntry({
            role: 'system',
            timestamp,
            subtype: 'codex-developer-context',
            title: 'Developer context',
            content: [...content, jsonBlock('Raw event', obj)],
            raw: obj
          })
        )
        continue
      }
      if (role === 'user') {
        const title =
          contentText.includes('<environment_context>') || contentText.includes('# AGENTS.md instructions')
            ? 'Environment context'
            : 'Model input context'
        const content = textBlocks(payload.content, title, false)
        if (content.length === 0) continue
        entries.push(
          codexEntry({
            role: 'system',
            timestamp,
            subtype: title === 'Environment context' ? 'codex-environment-context' : 'codex-model-input',
            title,
            content: [...content, jsonBlock('Raw event', obj)],
            raw: obj
          })
        )
        continue
      }
      const content = textBlocks(payload.content, 'Assistant message', true)
      if (content.length === 0) continue
      entries.push({ uuid: '', parentUuid: null, role: 'assistant', timestamp, content, subtype: 'codex-assistant-message', raw: obj })
    } else if (ptype === 'reasoning') {
      // `summary` is a (usually empty) array of reasoning blurbs; the full
      // reasoning lives in `encrypted_content`, which we cannot decrypt.
      const text = summaryText(payload.summary)
      entries.push(
        codexEntry({
          role: 'event',
          timestamp,
          subtype: 'codex-reasoning',
          title: 'Reasoning metadata',
          content: [
            metricBlock('Summary items', Array.isArray(payload.summary) ? payload.summary.length : 0),
            metricBlock('Encrypted content', str(payload.encrypted_content) ? 'present' : 'absent'),
            ...(text ? [{ type: 'thinking' as const, thinking: text }] : []),
            jsonBlock('Raw event', obj)
          ],
          raw: obj
        })
      )
    } else if (ptype === 'function_call' || ptype === 'custom_tool_call') {
      const input = ptype === 'custom_tool_call' ? payload.input : payload.arguments
      entries.push({
        uuid: '',
        parentUuid: null,
        role: 'assistant',
        timestamp,
        content: [
          {
            type: 'tool_use',
            id: str(payload.call_id) ?? '',
            name: str(payload.name) ?? 'tool',
            input: parseToolInput(input)
          }
        ],
        subtype: 'codex-tool-call',
        raw: obj
      })
    } else if (ptype === 'function_call_output' || ptype === 'custom_tool_call_output') {
      const out = payload.output
      const content = typeof out === 'string' ? out : JSON.stringify(out, null, 2)
      entries.push({
        uuid: '',
        parentUuid: null,
        role: 'user',
        timestamp,
        content: [{ type: 'tool_result', tool_use_id: str(payload.call_id) ?? '', content }],
        subtype: 'codex-tool-result',
        raw: obj
      })
    } else {
      entries.push(
        codexEntry({
          role: 'event',
          timestamp,
          subtype: `codex-${str(ptype) ?? 'response-item'}`,
          title: str(ptype) ?? 'Response item',
          content: [jsonBlock('Raw event', obj, false)],
          raw: obj
        })
      )
    }
  }

  const subagents = options.includeSubagents === false ? [] : await parseCodexSubagents(sessionId)
  return { sessionId, entries, subagents }
}
