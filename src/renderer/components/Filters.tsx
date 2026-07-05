import type React from 'react'
import { useState } from 'react'
import type { AggregateFilter, SourceId, DailyAggregate } from '@shared/types'

const SOURCE_LABELS: Record<SourceId, string> = {
  claude: 'Claude (1p)',
  'claude-3p': 'Claude 3p',
  codex: 'Codex'
}

type Preset = '24h' | '7d' | '30d' | 'custom'

const PRESETS: { id: Preset; label: string }[] = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d', label: 'Last 7d' },
  { id: '30d', label: 'Last 30d' },
  { id: 'custom', label: 'Custom' }
]

function offsetDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function presetDates(preset: Preset): { fromDate?: string; toDate?: string } {
  if (preset === '24h') return { fromDate: offsetDate(1), toDate: today() }
  if (preset === '7d') return { fromDate: offsetDate(6), toDate: today() }
  if (preset === '30d') return { fromDate: offsetDate(29), toDate: today() }
  return {}
}

function matchesPreset(filter: AggregateFilter, preset: Preset): boolean {
  const dates = presetDates(preset)
  return filter.fromDate === dates.fromDate && filter.toDate === dates.toDate
}

interface Props {
  filter: AggregateFilter
  onChange: (f: AggregateFilter) => void
  availableSources: SourceId[]
  days: DailyAggregate[]
}

export function Filters({ filter, onChange, availableSources, days }: Props): React.JSX.Element {
  const minDate = days.length > 0 ? days[0].date : undefined
  const maxDate = days.length > 0 ? days[days.length - 1].date : undefined
  const activeSources = filter.sources ?? availableSources
  const [activePreset, setActivePreset] = useState<Preset>('30d')

  function toggleSource(s: SourceId): void {
    const current = new Set(activeSources)
    if (current.has(s)) current.delete(s)
    else current.add(s)
    onChange({ ...filter, sources: [...current] })
  }

  function applyPreset(preset: Preset): void {
    setActivePreset(preset)
    if (preset !== 'custom') {
      onChange({ sources: filter.sources, ...presetDates(preset) })
    }
  }

  function handleCustomDate(patch: Partial<AggregateFilter>): void {
    // If dates no longer match any named preset, keep 'custom' active
    const next = { ...filter, ...patch }
    const matched = (['24h', '7d', '30d'] as Preset[]).find((p) => matchesPreset(next, p))
    setActivePreset(matched ?? 'custom')
    onChange(next)
  }

  const showCustomInputs = activePreset === 'custom'

  return (
    <div className="filters">
      <div className="filter-group">
        <span className="filter-label">Sources</span>
        {availableSources.map((s) => (
          <button
            key={s}
            className={activeSources.includes(s) ? 'chip active' : 'chip'}
            onClick={() => toggleSource(s)}
          >
            {SOURCE_LABELS[s] ?? s}
          </button>
        ))}
      </div>
      <div className="filter-group">
        <span className="filter-label">Period</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={activePreset === p.id ? 'chip active' : 'chip'}
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
        {showCustomInputs && (
          <div className="filter-custom-dates">
            <input
              type="date"
              value={filter.fromDate ?? ''}
              min={minDate}
              max={maxDate}
              onChange={(e) => handleCustomDate({ fromDate: e.target.value || undefined })}
            />
            <span className="filter-label">–</span>
            <input
              type="date"
              value={filter.toDate ?? ''}
              min={minDate}
              max={maxDate}
              onChange={(e) => handleCustomDate({ toDate: e.target.value || undefined })}
            />
          </div>
        )}
      </div>
    </div>
  )
}