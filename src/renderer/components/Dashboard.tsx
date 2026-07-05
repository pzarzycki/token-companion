import type React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts'
import type { Aggregates, PricingTable } from '@shared/types'
import { fmtCost, fmtTokens } from '../format'

interface Props {
  aggregates: Aggregates
  pricing: PricingTable
}

export function Dashboard({ aggregates }: Props): React.JSX.Element {
  const { overall, byDay, bySource } = aggregates

  const chartData = byDay.map((d) => ({
    date: d.date,
    cost: d.cost ?? 0,
    tokens: d.totalTokens
  }))

  return (
    <div className="dashboard">
      <div className="cards">
        <StatCard
          label="Total cost"
          value={fmtCost(overall.cost)}
          hint={overall.hasUnpricedModel ? 'excludes unpriced models' : undefined}
          accent
        />
        <StatCard label="Input tokens" value={fmtTokens(overall.inputTokens)} />
        <StatCard label="Cache read" value={fmtTokens(overall.cacheReadTokens)} />
        <StatCard label="Cache write" value={fmtTokens(overall.cacheWriteTokens)} />
        <StatCard label="Output tokens" value={fmtTokens(overall.outputTokens)} />
        <StatCard label="Sessions" value={String(aggregates.sessionCount)} />
      </div>

      <section className="panel">
        <h2>Cost over time</h2>
        {chartData.length === 0 ? (
          <p className="empty">No data in range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232733" />
              <XAxis dataKey="date" tick={{ fill: '#8b93a7', fontSize: 11 }} minTickGap={24} />
              <YAxis
                tick={{ fill: '#8b93a7', fontSize: 11 }}
                tickFormatter={(v: number) => '$' + v.toFixed(0)}
              />
              <Tooltip
                contentStyle={{ background: '#171b24', border: '1px solid #2a2f3c', borderRadius: 8 }}
                labelStyle={{ color: '#e6e9f0' }}
                formatter={(v) => [fmtCost(typeof v === 'number' ? v : Number(v) || 0), 'Cost']}
              />
              <Bar dataKey="cost" fill="#6c8cff" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="panel">
        <h2>By source</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th className="num">Sessions</th>
              <th className="num">Input</th>
              <th className="num">Cache R</th>
              <th className="num">Cache W</th>
              <th className="num">Output</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {bySource.map((s) => (
              <tr key={`${s.source}-${s.subSource}`}>
                <td>
                  <span className="src-badge">{s.source}</span> {s.subSource}
                </td>
                <td className="num">{s.sessionCount}</td>
                <td className="num">{fmtTokens(s.inputTokens)}</td>
                <td className="num">{fmtTokens(s.cacheReadTokens)}</td>
                <td className="num">{fmtTokens(s.cacheWriteTokens)}</td>
                <td className="num">{fmtTokens(s.outputTokens)}</td>
                <td className="num cost">
                  {fmtCost(s.cost)}
                  {s.hasUnpricedModel && <span className="warn-dot" title="Some models unpriced">*</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  accent
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
}): React.JSX.Element {
  return (
    <div className={accent ? 'stat-card accent' : 'stat-card'}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}