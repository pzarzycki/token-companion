import type React from 'react'
import type { ConversationEntry, ContentBlock } from '@shared/types'

interface Props {
  entries: ConversationEntry[]
  /** The requestId of the assistant UsageRecord we want to highlight */
  targetRequestId: string | undefined
  /**
   * Render the whole conversation rather than a single user/assistant pair.
   * Used for sources (e.g. Codex) that emit one session-level UsageRecord, so
   * there is no per-message requestId to match against.
   */
  renderAll?: boolean
}

export function EntryView({ entries, targetRequestId, renderAll }: Props): React.JSX.Element | null {
  if (renderAll) {
    if (entries.length === 0)
      return <div className="entry-loading">No conversation content found.</div>
    return (
      <div className="entry-pair">
        {entries.map((entry, i) => (
          <EntryTurn key={i} entry={entry} />
        ))}
      </div>
    )
  }

  // Find the assistant entry matching this record (requestId = message.id = dedupKey)
  let assistantIdx = entries.findIndex(
    (e) => e.role === 'assistant' && e.requestId === targetRequestId
  )
  // Fallback: if no exact match, show last assistant entry (edge case for sessions without requestId)
  if (assistantIdx === -1) {
    assistantIdx = entries.map((e, i) => ({ e, i })).reverse().find(({ e }) => e.role === 'assistant')?.i ?? -1
  }
  if (assistantIdx === -1) return <div className="entry-loading">No conversation content found.</div>

  const assistant = entries[assistantIdx]
  // The user turn immediately before this assistant turn
  const user = assistantIdx > 0 && entries[assistantIdx - 1].role === 'user'
    ? entries[assistantIdx - 1]
    : null

  return (
    <div className="entry-pair">
      {user && <EntryTurn entry={user} />}
      <EntryTurn entry={assistant} />
    </div>
  )
}

function EntryTurn({ entry }: { entry: ConversationEntry }): React.JSX.Element {
  return (
    <div className={`entry-turn entry-${entry.role}`}>
      <div className="entry-role">
        {entry.role === 'user' ? 'User' : entry.model ? `Assistant · ${entry.model}` : 'Assistant'}
      </div>
      <div className="entry-content">
        {entry.content.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </div>
    </div>
  )
}

function BlockView({ block }: { block: ContentBlock }): React.JSX.Element {
  if (block.type === 'text') {
    return <pre className="entry-block block-text">{block.text}</pre>
  }

  if (block.type === 'thinking') {
    return (
      <details className="entry-block block-thinking">
        <summary>Thinking</summary>
        <pre>{block.thinking}</pre>
      </details>
    )
  }

  if (block.type === 'tool_use') {
    return (
      <details className="entry-block block-tool-use">
        <summary>
          <span className="tool-name">{block.name}</span>
        </summary>
        <pre>{JSON.stringify(block.input, null, 2)}</pre>
      </details>
    )
  }

  if (block.type === 'tool_result') {
    const content = block.content
    return (
      <details className="entry-block block-tool-result" open>
        <summary>
          <span className="tool-result-label">Result</span>
          <span className="tool-result-id">{block.tool_use_id.slice(-8)}</span>
        </summary>
        {typeof content === 'string' ? (
          <pre>{content}</pre>
        ) : (
          content.map((b, i) => <BlockView key={i} block={b} />)
        )}
      </details>
    )
  }

  return <pre className="entry-block block-unknown">{JSON.stringify((block as {raw: unknown}).raw, null, 2)}</pre>
}
