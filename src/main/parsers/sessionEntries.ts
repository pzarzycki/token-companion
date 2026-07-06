import type { ContentBlock, ConversationEntry, SessionEntries } from '@shared/types'
import { num, readJsonlObjects, str } from './jsonlReader'

function parseContentBlock(raw: unknown): ContentBlock {
  if (!raw || typeof raw !== 'object') return { type: 'unknown', raw }
  const b = raw as Record<string, unknown>
  const t = b.type
  if (t === 'text' && typeof b.text === 'string') return { type: 'text', text: b.text }
  if (t === 'thinking' && typeof b.thinking === 'string')
    return { type: 'thinking', thinking: b.thinking }
  if (t === 'tool_use')
    return { type: 'tool_use', id: str(b.id) ?? '', name: str(b.name) ?? '', input: b.input }
  if (t === 'tool_result') {
    const content = b.content
    if (typeof content === 'string') {
      return { type: 'tool_result', tool_use_id: str(b.tool_use_id) ?? '', content }
    }
    if (Array.isArray(content)) {
      return {
        type: 'tool_result',
        tool_use_id: str(b.tool_use_id) ?? '',
        content: content.map(parseContentBlock)
      }
    }
    return { type: 'tool_result', tool_use_id: str(b.tool_use_id) ?? '', content: '' }
  }
  return { type: 'unknown', raw }
}

function parseContent(raw: unknown): ContentBlock[] {
  if (typeof raw === 'string') return [{ type: 'text', text: raw }]
  if (Array.isArray(raw)) return raw.map(parseContentBlock)
  return []
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
}

function pushJsonBlock(
  blocks: ContentBlock[],
  label: string,
  value: unknown,
  defaultOpen = false
): void {
  if (value === undefined || value === null) return
  blocks.push({ type: 'json', label, value, defaultOpen })
}

function parseSystemEntry(obj: Record<string, unknown>): ConversationEntry {
  const subtype = str(obj.subtype) ?? 'system'
  const blocks: ContentBlock[] = []

  if (subtype === 'init') {
    const tools = stringList(obj.tools)
    const slashCommands = stringList(obj.slash_commands)
    const agents = stringList(obj.agents)
    const skills = stringList(obj.skills)

    blocks.push({ type: 'metric', label: 'Model', value: str(obj.model) ?? 'unknown' })
    blocks.push({ type: 'metric', label: 'Permission mode', value: str(obj.permissionMode) ?? 'unknown' })
    blocks.push({ type: 'metric', label: 'Claude Code', value: str(obj.claude_code_version) ?? 'unknown' })
    blocks.push({ type: 'metric', label: 'CWD', value: str(obj.cwd) ?? 'unknown' })
    blocks.push({ type: 'list', label: `Tools (${tools.length})`, items: tools })
    pushJsonBlock(blocks, 'MCP servers', obj.mcp_servers, true)
    if (slashCommands.length) blocks.push({ type: 'list', label: `Slash commands (${slashCommands.length})`, items: slashCommands })
    if (agents.length) blocks.push({ type: 'list', label: `Agents (${agents.length})`, items: agents })
    if (skills.length) blocks.push({ type: 'list', label: `Skills (${skills.length})`, items: skills })
    pushJsonBlock(blocks, 'Plugins', obj.plugins)
  } else if (subtype === 'thinking_tokens') {
    blocks.push({ type: 'metric', label: 'Estimated tokens', value: num(obj.estimated_tokens) })
    blocks.push({ type: 'metric', label: 'Delta', value: num(obj.estimated_tokens_delta) })
  } else if (subtype === 'status') {
    blocks.push({ type: 'metric', label: 'Status', value: str(obj.status) ?? 'unknown' })
  }

  pushJsonBlock(blocks, 'Raw event', obj)

  return {
    uuid: str(obj.uuid) ?? '',
    parentUuid: null,
    role: 'system',
    subtype,
    title: subtype === 'init' ? 'Session init' : `System · ${subtype}`,
    timestamp: str(obj.timestamp) ?? '',
    content: blocks,
    raw: obj
  }
}

function parseResultEntry(obj: Record<string, unknown>): ConversationEntry {
  const usage = obj.usage as Record<string, unknown> | undefined
  const blocks: ContentBlock[] = []

  blocks.push({ type: 'metric', label: 'Status', value: str(obj.subtype) ?? 'result' })
  blocks.push({ type: 'metric', label: 'Terminal reason', value: str(obj.terminal_reason) ?? str(obj.stop_reason) ?? 'unknown' })
  blocks.push({ type: 'metric', label: 'Duration', value: `${num(obj.duration_ms)} ms` })
  blocks.push({ type: 'metric', label: 'API duration', value: `${num(obj.duration_api_ms)} ms` })
  blocks.push({ type: 'metric', label: 'TTFT', value: `${num(obj.ttft_ms)} ms` })
  blocks.push({ type: 'metric', label: 'Turns', value: num(obj.num_turns) })
  if (typeof obj.total_cost_usd === 'number') {
    blocks.push({ type: 'metric', label: 'Reported cost', value: `$${obj.total_cost_usd.toFixed(6)}` })
  }
  if (usage) pushJsonBlock(blocks, 'Usage', usage, true)
  pushJsonBlock(blocks, 'Model usage', obj.modelUsage, true)
  pushJsonBlock(blocks, 'Permission denials', obj.permission_denials)
  const result = str(obj.result)
  if (result) blocks.push({ type: 'text', text: result })
  pushJsonBlock(blocks, 'Raw event', obj)

  return {
    uuid: str(obj.uuid) ?? '',
    parentUuid: null,
    role: 'result',
    subtype: str(obj.subtype),
    title: 'Result',
    timestamp: str(obj.timestamp) ?? '',
    content: blocks,
    raw: obj
  }
}

function parseGenericEventEntry(obj: Record<string, unknown>): ConversationEntry {
  const type = str(obj.type) ?? 'event'
  const subtype = str(obj.subtype) ?? str((obj.rate_limit_info as Record<string, unknown> | undefined)?.rateLimitType)
  const blocks: ContentBlock[] = []

  if (type === 'rate_limit_event') {
    pushJsonBlock(blocks, 'Rate limit', obj.rate_limit_info, true)
  }
  pushJsonBlock(blocks, 'Raw event', obj, type !== 'rate_limit_event')

  return {
    uuid: str(obj.uuid) ?? '',
    parentUuid: null,
    role: 'event',
    subtype,
    title: subtype ? `${type} · ${subtype}` : type,
    timestamp: str(obj.timestamp) ?? '',
    content: blocks,
    raw: obj
  }
}

export async function parseSessionEntries(
  filePath: string,
  sessionId: string
): Promise<SessionEntries> {
  // Claude writes multiple JSONL records per assistant turn (same message.id),
  // one per content type: thinking → text → tool_use. Merge them by message.id.
  const assistantByMsgId = new Map<string, ConversationEntry>()
  const userByUuid = new Set<string>()
  const entries: ConversationEntry[] = []

  for await (const obj of readJsonlObjects(filePath)) {
    const type = obj.type
    if (type === 'system') {
      entries.push(parseSystemEntry(obj))
      continue
    }
    if (type === 'result') {
      entries.push(parseResultEntry(obj))
      continue
    }
    if (type !== 'user' && type !== 'assistant') {
      entries.push(parseGenericEventEntry(obj))
      continue
    }
    const objSessionId = str(obj.sessionId)
    if (objSessionId && objSessionId !== sessionId) continue

    const message = obj.message as Record<string, unknown> | undefined
    if (!message || typeof message !== 'object') continue

    const role = type as 'user' | 'assistant'
    const content = parseContent(message.content)

    if (role === 'assistant') {
      // message.id is the stable key shared across all streaming chunks of one turn
      const messageId = str(message.id)
      const requestId = str(obj.requestId) ?? str(obj.request_id)
      const linkKey = messageId ?? requestId

      if (linkKey && assistantByMsgId.has(linkKey)) {
        // Append content blocks to the existing entry (streaming chunk)
        const existing = assistantByMsgId.get(linkKey)!
        existing.content.push(...content)
      } else {
        const entry: ConversationEntry = {
          uuid: str(obj.uuid) ?? '',
          parentUuid: str(obj.parentUuid) ?? null,
          role: 'assistant',
          timestamp: str(obj.timestamp) ?? '',
          content,
          model: str(message.model),
          requestId: linkKey
        }
        if (linkKey) assistantByMsgId.set(linkKey, entry)
        entries.push(entry)
      }
    } else {
      const uuid = str(obj.uuid) ?? ''
      if (uuid && userByUuid.has(uuid)) continue
      if (uuid) userByUuid.add(uuid)
      entries.push({
        uuid,
        parentUuid: str(obj.parentUuid) ?? null,
        role: 'user',
        timestamp: str(obj.timestamp) ?? '',
        content
      })
    }
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return { sessionId, entries }
}
