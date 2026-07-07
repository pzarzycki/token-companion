import React, { useMemo, useState, useCallback } from 'react'
import type { SessionAggregate, UsageRecord, PricingTable, SessionEntries } from '@shared/types'
import { recordCost } from '@shared/aggregate'
import { fmtCost, fmtTokens, fmtDateTime, projectName } from '../format'
import { EntryView } from './EntryView'

interface Props {
  sessions: SessionAggregate[]
  records: UsageRecord[]
  pricing: PricingTable
}

export function SessionList({ sessions, records, pricing }: Props): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [sessionEntries, setSessionEntries] = useState<SessionEntries | null>(null)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null)
  const [showSubagentRows, setShowSubagentRows] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visibleSessions = showSubagentRows ? sessions : sessions.filter((s) => !s.isSubagent)
    if (!q) return visibleSessions
    return visibleSessions.filter(
      (s) =>
        s.sessionId.toLowerCase().includes(q) ||
        (s.cwd ?? '').toLowerCase().includes(q) ||
        (s.agentNickname ?? '').toLowerCase().includes(q) ||
        (s.parentSessionId ?? '').toLowerCase().includes(q) ||
        s.models.some((m) => m.toLowerCase().includes(q))
    )
  }, [sessions, query, showSubagentRows])

  const detailRecords = useMemo(() => {
    if (!selected) return []
    return records
      .filter((r) => r.sessionId === selected)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }, [selected, records])

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelected(sessionId)
    setSessionEntries(null)
    setExpandedRecord(null)
    setEntriesLoading(false)
  }, [])

  const handleRowClick = useCallback(
    async (record: UsageRecord) => {
      const key = record.dedupKey
      if (expandedRecord === key) {
        setExpandedRecord(null)
        return
      }
      setExpandedRecord(key)

      if (!sessionEntries && !entriesLoading) {
        setEntriesLoading(true)
        try {
          const result = await window.api.getSessionEntries(
            record.filePath,
            record.sessionId,
            record.source
          )
          setSessionEntries(result)
        } catch {
          setSessionEntries({ sessionId: record.sessionId, entries: [] })
        } finally {
          setEntriesLoading(false)
        }
      }
    },
    [expandedRecord, sessionEntries, entriesLoading]
  )

  if (selected) {
    const sess = sessions.find((s) => s.sessionId === selected)
    return (
      <div className="panel">
        <button className="back" onClick={() => setSelected(null)}>
          ← All sessions
        </button>
        <h2 className="session-title">
          <span>Session</span> <code>{selected}</code>
        </h2>
        {sess && (
          <div className="session-meta">
            <span><b>Source:</b> {sess.source} / {sess.subSource}</span>
            <span><b>Project:</b> {projectName(sess.cwd)}</span>
            <span><b>Models:</b> {sess.models.join(', ')}</span>
            <span><b>Cost:</b> {fmtCost(sess.cost)}</span>
            <span><b>Records:</b> {sess.recordCount}</span>
            {sess.subagentCount ? <span><b>Subagents:</b> {sess.subagentCount}</span> : null}
            {sess.isSubagent && sess.parentSessionId && (
              <span>
                <b>Subagent of:</b>{' '}
                <button className="inline-link" onClick={() => handleSelectSession(sess.parentSessionId!)}>
                  {sess.parentSessionId}
                </button>
              </span>
            )}
            {sess.agentNickname && <span><b>Agent:</b> {sess.agentNickname}</span>}
          </div>
        )}
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Model</th>
              <th className="num">Input</th>
              <th className="num">Cache R</th>
              <th className="num">Cache W</th>
              <th className="num">Output</th>
              <th className="num">Reasoning</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {detailRecords.map((r, i) => (
              <React.Fragment key={r.dedupKey + i}>
                <tr
                  className={`clickable${expandedRecord === r.dedupKey ? ' row-expanded' : ''}`}
                  onClick={() => handleRowClick(r)}
                >
                  <td>{fmtDateTime(r.timestamp)}</td>
                  <td>{r.model}</td>
                  <td className="num">{fmtTokens(r.inputTokens)}</td>
                  <td className="num">{fmtTokens(r.cacheReadTokens)}</td>
                  <td className="num">{fmtTokens(r.cacheWriteTokens)}</td>
                  <td className="num">{fmtTokens(r.outputTokens)}</td>
                  <td className="num">{r.reasoningTokens ? fmtTokens(r.reasoningTokens) : '—'}</td>
                  <td className="num cost">{fmtCost(recordCost(r, pricing))}</td>
                </tr>
                {expandedRecord === r.dedupKey && (
                  <tr className="entry-row">
                    <td colSpan={8} className="entry-cell">
                      {entriesLoading || sessionEntries === null ? (
                        <div className="entry-loading">Loading…</div>
                      ) : (
                        <EntryView
                          entries={sessionEntries.entries}
                          targetRequestId={r.conversationRequestId ?? r.dedupKey}
                          renderAll={r.source === 'codex'}
                          subagents={sessionEntries.subagents}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>
          Sessions ({filtered.length})
          {!showSubagentRows && sessions.some((s) => s.isSubagent) && (
            <span className="panel-count-note">subagent rows hidden</span>
          )}
        </h2>
        <div className="panel-controls">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={showSubagentRows}
              onChange={(e) => setShowSubagentRows(e.target.checked)}
            />
            <span>Show subagent rows</span>
          </label>
          <input
            className="search"
            placeholder="Search id / project / model…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Last activity</th>
            <th>Source</th>
            <th>Project</th>
            <th>Models</th>
            <th className="num">Input</th>
            <th className="num">Cache R</th>
            <th className="num">Output</th>
            <th className="num">Cost</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 500).map((s) => (
            <tr key={s.sessionId} className="clickable" onClick={() => handleSelectSession(s.sessionId)}>
              <td>{fmtDateTime(s.lastTimestamp)}</td>
              <td>
                <span className="src-badge">{s.source}</span>
                {s.isSubagent && <span className="subagent-badge">subagent</span>}
                {s.subagentCount ? <span className="subagent-badge">{s.subagentCount} agents</span> : null}
              </td>
              <td className="ellipsis" title={s.cwd}>{projectName(s.cwd)}</td>
              <td className="ellipsis">
                {s.agentNickname ? `${s.agentNickname} · ` : ''}
                {s.models.join(', ')}
              </td>
              <td className="num">{fmtTokens(s.inputTokens)}</td>
              <td className="num">{fmtTokens(s.cacheReadTokens)}</td>
              <td className="num">{fmtTokens(s.outputTokens)}</td>
              <td className="num cost">{fmtCost(s.cost)}</td>
              <td className="chevron">›</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length > 500 && (
        <p className="empty">Showing first 500 of {filtered.length}. Narrow with search or filters.</p>
      )}
    </div>
  )
}
