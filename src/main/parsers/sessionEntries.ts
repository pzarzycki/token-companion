import type { ContentBlock, ConversationEntry, SessionEntries } from '@shared/types'
import { readJsonlObjects, str } from './jsonlReader'

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

export async function parseSessionEntries(
  filePath: string,
  sessionId: string
): Promise<SessionEntries> {
  // Claude writes multiple JSONL records per assistant turn (same message.id),
  // one per content type: thinking → text → tool_use. Merge them by message.id.
  const assistantByMsgId = new Map<string, ConversationEntry>()
  const entries: ConversationEntry[] = []

  for await (const obj of readJsonlObjects(filePath)) {
    const type = obj.type
    if (type !== 'user' && type !== 'assistant') continue
    const objSessionId = str(obj.sessionId)
    if (objSessionId && objSessionId !== sessionId) continue

    const message = obj.message as Record<string, unknown> | undefined
    if (!message || typeof message !== 'object') continue

    const role = type as 'user' | 'assistant'
    const content = parseContent(message.content)

    if (role === 'assistant') {
      // message.id is the stable key shared across all streaming chunks of one turn
      const messageId = str(message.id)
      const requestId = str(obj.requestId)
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
      entries.push({
        uuid: str(obj.uuid) ?? '',
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
