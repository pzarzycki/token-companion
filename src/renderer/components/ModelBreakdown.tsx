import type React from 'react'
import { useState } from 'react'
import type { ModelAggregate, PricingTable } from '@shared/types'
import { fmtCost, fmtTokens } from '../format'

type SortKey = 'cost' | 'totalTokens' | 'model' | 'recordCount'

interface Props {
  models: ModelAggregate[]
  pricing: PricingTable
}

export function ModelBreakdown({ models, pricing }: Props): React.JSX.Element {
  const [sort, setSort] = useState<SortKey>('cost')
  const [asc, setAsc] = useState(false)

  const sorted = [...models].sort((a, b) => {
    let cmp = 0
    if (sort === 'model') cmp = a.model.localeCompare(b.model)
    else if (sort === 'cost') cmp = (a.cost ?? 0) - (b.cost ?? 0)
    else if (sort === 'totalTokens') cmp = a.totalTokens - b.totalTokens
    else cmp = a.recordCount - b.recordCount
    return asc ? cmp : -cmp
  })

  function header(key: SortKey, label: string, numeric = true): React.JSX.Element {
    const active = sort === key
    return (
      <th
        className={numeric ? 'num sortable' : 'sortable'}
        onClick={() => {
          if (active) setAsc(!asc)
          else {
            setSort(key)
            setAsc(false)
          }
        }}
      >
        {label} {active ? (asc ? '▲' : '▼') : ''}
      </th>
    )
  }

  if (models.length === 0) return <p className="empty">No model usage in range.</p>

  return (
    <div className="panel">
      <h2>Usage by model</h2>
      <table className="data-table">
        <thead>
          <tr>
            {header('model', 'Model', false)}
            <th>Provider</th>
            {header('recordCount', 'Records')}
            <th className="num">Input</th>
            <th className="num">Cache R</th>
            <th className="num">Cache W</th>
            <th className="num">Output</th>
            {header('totalTokens', 'Total')}
            <th className="num">$/Mtok</th>
            {header('cost', 'Cost')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const entry = pricing.models[m.model]
            return (
              <tr key={m.model}>
                <td className="model-name">
                  {entry?.label ?? m.model}
                  {!entry && <span className="tag danger" title="No pricing entry">no price</span>}
                  {entry?.verify && <span className="tag warn" title={entry.note}>verify</span>}
                </td>
                <td>{m.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}</td>
                <td className="num">{m.recordCount.toLocaleString()}</td>
                <td className="num">{fmtTokens(m.inputTokens)}</td>
                <td className="num">{fmtTokens(m.cacheReadTokens)}</td>
                <td className="num">{fmtTokens(m.cacheWriteTokens)}</td>
                <td className="num">{fmtTokens(m.outputTokens)}</td>
                <td className="num">{fmtTokens(m.totalTokens)}</td>
                <td className="num rate">
                  {entry ? `$${entry.input}/$${entry.output}` : '—'}
                </td>
                <td className="num cost">{fmtCost(m.cost)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}