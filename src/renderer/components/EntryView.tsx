import React, { useState } from 'react'
import type { ConversationEntry, ContentBlock, SubagentTrace } from '@shared/types'

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
  subagents?: SubagentTrace[]
}

export function EntryView({ entries, targetRequestId, renderAll, subagents }: Props): React.JSX.Element | null {
  if (renderAll) {
    if (entries.length === 0)
      return <div className="entry-loading">No conversation content found.</div>
    const isCodexTrace = entries.some((entry) => entry.subtype?.startsWith('codex-'))
    if (isCodexTrace) {
      const readableEntries = entries.filter(isReadableCodexEntry)
      return (
        <div className="entry-pair entry-with-audit">
          <div className="entry-focus">
            {readableEntries.length ? (
              readableEntries.map((entry, i) => <EntryTurn key={i} entry={entry} />)
            ) : (
              <div className="entry-loading">No readable conversation content found.</div>
            )}
          </div>
          {subagents && subagents.length > 0 && <SubagentTrace subagents={subagents} />}
          <details className="audit-trace">
            <summary>Full Codex trace ({entries.length} events)</summary>
            <div className="audit-events">
              {entries.map((entry, i) => (
                <EntryTurn key={i} entry={entry} />
              ))}
            </div>
          </details>
        </div>
      )
    }
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
      {subagents && subagents.length > 0 && <SubagentTrace subagents={subagents} />}
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

function fmtCount(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 1 : 2)}K`
  return String(n)
}

function fmtTime(timestamp: string): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleTimeString()
}

function SubagentTrace({ subagents }: { subagents: SubagentTrace[] }): React.JSX.Element {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const active = expandedAgent ? subagents.find((s) => s.agentId === expandedAgent) : undefined
  const hasCodex = subagents.some((s) => s.source === 'codex')
  const hasCowork = subagents.some((s) => s.source === 'claude-cowork')
  const note = hasCodex && hasCowork
    ? 'mixed accounting by source'
    : hasCodex
      ? 'billable child sessions, linked to parent trace'
      : 'display-only, included in parent Cowork cost'
  const activeReadableEntries = active?.source === 'codex'
    ? active.entries.filter(isReadableCodexEntry)
    : (active?.entries ?? [])

  return (
    <details className="subagent-trace">
      <summary>
        <span>Subagents ({subagents.length})</span>
        <span className="subagent-note">{note}</span>
      </summary>
      <div className="subagent-table-wrap">
        <table className="subagent-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Description</th>
              <th>Models</th>
              <th className="num">Steps</th>
              <th className="num">Input</th>
              <th className="num">Cache R</th>
              <th className="num">Cache W</th>
              <th className="num">Output</th>
              <th className="num">Reasoning</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subagents.map((agent) => (
              <tr
                key={agent.agentId}
                className={`clickable${expandedAgent === agent.agentId ? ' row-expanded' : ''}`}
                onClick={() => setExpandedAgent(expandedAgent === agent.agentId ? null : agent.agentId)}
              >
                <td>
                  {agent.description && <span className="subagent-name">{agent.description}</span>}
                  <code title={agent.agentId}>{agent.agentId.slice(0, 10)}</code>
                  <span className="subagent-time">{fmtTime(agent.firstTimestamp)}</span>
                </td>
                <td className="subagent-description">
                  <span>{agent.promptPreview ?? agent.taskType ?? agent.agentId}</span>
                  {agent.parentSessionId && <small title={agent.parentSessionId}>parent {agent.parentSessionId}</small>}
                </td>
                <td className="subagent-models">{agent.models.join(', ') || '—'}</td>
                <td className="num">{agent.stepCount || agent.progressCount || '—'}</td>
                <td className="num">{fmtCount(agent.inputTokens)}</td>
                <td className="num">{fmtCount(agent.cacheReadTokens)}</td>
                <td className="num">{fmtCount(agent.cacheWriteTokens)}</td>
                <td className="num">{fmtCount(agent.outputTokens)}</td>
                <td className="num">{agent.reasoningTokens ? fmtCount(agent.reasoningTokens) : '—'}</td>
                <td>{agent.status ?? agent.subagentType ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active && (
        <div className="subagent-detail">
          <div className="subagent-detail-head">
            <span>{active.description ?? active.agentId}</span>
            <code>{active.agentId}</code>
          </div>
          {activeReadableEntries.length ? (
            activeReadableEntries.map((entry, i) => <EntryTurn key={i} entry={entry} />)
          ) : (
            <div className="entry-loading">No subagent transcript found for this task.</div>
          )}
          {active.source === 'codex' && active.entries.length > activeReadableEntries.length && (
            <details className="audit-trace">
              <summary>Full Codex subagent trace ({active.entries.length} events)</summary>
              <div className="audit-events">
                {active.entries.map((entry, i) => (
                  <EntryTurn key={i} entry={entry} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </details>
  )
}

function isReadableCodexEntry(entry: ConversationEntry): boolean {
  return (
    entry.subtype === 'codex-user-message' ||
    entry.subtype === 'codex-assistant-message' ||
    entry.subtype === 'codex-tool-call' ||
    entry.subtype === 'codex-tool-result'
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

  if (block.type === 'long_text') {
    return (
      <details className="entry-block block-long-text" open={block.defaultOpen}>
        <summary>
          <span>{block.label}</span>
          {block.preview && <span className="long-text-preview">{block.preview}</span>}
        </summary>
        <pre>{block.text}</pre>
      </details>
    )
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
    const open = typeof content !== 'string' || content.length <= 1200
    return (
      <details className="entry-block block-tool-result" open={open}>
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
