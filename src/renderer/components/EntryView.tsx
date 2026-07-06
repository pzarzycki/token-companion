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
  const user =
    entries
      .slice(0, assistantIdx)
      .reverse()
      .find((entry) => entry.role === 'user') ?? null

  return (
    <div className="entry-pair entry-with-audit">
      <div className="entry-focus">
        {user && <EntryTurn entry={user} />}
        <EntryTurn entry={assistant} />
      </div>
      <details className="audit-trace">
        <summary>Full audit trace ({entries.length} events)</summary>
        <div className="audit-events">
          {entries.map((entry, i) => (
            <EntryTurn key={i} entry={entry} />
          ))}
        </div>
      </details>
    </div>
  )
}

function EntryTurn({ entry }: { entry: ConversationEntry }): React.JSX.Element {
  const label =
    entry.role === 'user'
      ? 'User'
      : entry.role === 'assistant'
        ? entry.model
          ? `Assistant · ${entry.model}`
          : 'Assistant'
        : entry.title ?? (entry.subtype ? `${entry.role} · ${entry.subtype}` : entry.role)

  return (
    <div className={`entry-turn entry-${entry.role}`}>
      <div className="entry-role">
        <span>{label}</span>
        {entry.timestamp && <span className="entry-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>}
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
    const thinking = block.thinking.trim()
    return (
      <details className="entry-block block-thinking">
        <summary>Thinking</summary>
        <pre>{thinking || 'No thinking text recorded in this trace.'}</pre>
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

  if (block.type === 'json') {
    return (
      <details className="entry-block block-json" open={block.defaultOpen}>
        <summary>{block.label}</summary>
        <pre>{JSON.stringify(block.value, null, 2)}</pre>
      </details>
    )
  }

  if (block.type === 'list') {
    return (
      <details className="entry-block block-list" open={block.defaultOpen}>
        <summary>{block.label}</summary>
        <div className="entry-list">
          {block.items.map((item) => (
            <span key={item} className="entry-pill">{item}</span>
          ))}
        </div>
      </details>
    )
  }

  if (block.type === 'metric') {
    return (
      <div className="entry-metric">
        <span>{block.label}</span>
        <b>{block.value}</b>
      </div>
    )
  }

  return <pre className="entry-block block-unknown">{JSON.stringify((block as {raw: unknown}).raw, null, 2)}</pre>
}
