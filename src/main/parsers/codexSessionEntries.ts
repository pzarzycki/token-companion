import type { ContentBlock, ConversationEntry, SessionEntries } from '@shared/types'
import { readJsonlObjects, str } from './jsonlReader'

/**
 * Extract readable text from a Codex Responses-API content array. Codex uses
 * `input_text` (user/developer turns) and `output_text` (assistant turns),
 * unlike Claude's `text`. Each becomes a text ContentBlock.
 */
function textBlocks(raw: unknown): ContentBlock[] {
  if (typeof raw === 'string') return raw ? [{ type: 'text', text: raw }] : []
  if (!Array.isArray(raw)) return []
  const blocks: ContentBlock[] = []
  for (const part of raw) {
    if (!part || typeof part !== 'object') continue
    const p = part as Record<string, unknown>
    const t = p.type
    if ((t === 'input_text' || t === 'output_text' || t === 'text') && typeof p.text === 'string') {
      blocks.push({ type: 'text', text: p.text })
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
  sessionId: string
): Promise<SessionEntries> {
  const entries: ConversationEntry[] = []

  for await (const obj of readJsonlObjects(filePath)) {
    if (obj.type !== 'response_item') continue
    const payload = obj.payload as Record<string, unknown> | undefined
    if (!payload || typeof payload !== 'object') continue

    const timestamp = str(obj.timestamp) ?? ''
    const ptype = payload.type

    if (ptype === 'message') {
      const role = payload.role === 'assistant' ? 'assistant' : 'user'
      const content = textBlocks(payload.content)
      if (content.length === 0) continue
      entries.push({ uuid: '', parentUuid: null, role, timestamp, content })
    } else if (ptype === 'reasoning') {
      // `summary` is a (usually empty) array of reasoning blurbs; the full
      // reasoning lives in `encrypted_content`, which we cannot decrypt.
      const summary = Array.isArray(payload.summary) ? payload.summary : []
      const text = summary
        .map((s) => {
          if (typeof s === 'string') return s
          if (s && typeof s === 'object' && typeof (s as Record<string, unknown>).text === 'string') {
            return (s as Record<string, unknown>).text as string
          }
          return ''
        })
        .filter(Boolean)
        .join('\n\n')
      entries.push({
        uuid: '',
        parentUuid: null,
        role: 'assistant',
        timestamp,
        content: [{ type: 'thinking', thinking: text || '(reasoning not recorded — encrypted)' }]
      })
    } else if (ptype === 'function_call' || ptype === 'custom_tool_call') {
      // custom_tool_call carries `input`; function_call carries `arguments`.
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
        ]
      })
    } else if (ptype === 'function_call_output' || ptype === 'custom_tool_call_output') {
      const out = payload.output
      const content = typeof out === 'string' ? out : JSON.stringify(out)
      entries.push({
        uuid: '',
        parentUuid: null,
        role: 'user',
        timestamp,
        content: [{ type: 'tool_result', tool_use_id: str(payload.call_id) ?? '', content }]
      })
    }
  }

  return { sessionId, entries }
}
