import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import type {
  ScanResult,
  PricingTable,
  AggregateFilter,
  SourceId
} from '@shared/types'
import { aggregate } from '@shared/aggregate'
import { Dashboard } from './components/Dashboard'
import { ModelBreakdown } from './components/ModelBreakdown'
import { SessionList } from './components/SessionList'
import { PricingEditor } from './components/PricingEditor'
import { DesktopGap } from './components/DesktopGap'
import { Filters } from './components/Filters'

type Tab = 'dashboard' | 'models' | 'sessions' | 'pricing'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'models', label: 'Models' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'pricing', label: 'Pricing' }
]

export function App(): React.JSX.Element {
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [pricing, setPricing] = useState<PricingTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [filter, setFilter] = useState<AggregateFilter>(() => {
    const d = new Date()
    const toDate = d.toISOString().slice(0, 10)
    d.setDate(d.getDate() - 29)
    const fromDate = d.toISOString().slice(0, 10)
    return { fromDate, toDate }
  })

  async function loadAll(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [scanResult, pricingTable] = await Promise.all([
        window.api.scan(),
        window.api.getPricing()
      ])
      setScan(scanResult)
      setPricing(pricingTable)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  const aggregates = useMemo(() => {
    if (!scan || !pricing) return null
    return aggregate(scan.records, pricing, filter)
  }, [scan, pricing, filter])

  const availableSources = useMemo<SourceId[]>(() => {
    if (!scan) return []
    return [...new Set(scan.records.map((r) => r.source))]
  }, [scan])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span> Token Companion
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button className="refresh" onClick={() => void loadAll()} disabled={loading}>
          {loading ? 'Scanning…' : '↻ Rescan'}
        </button>
      </header>

      {error && <div className="banner error">Error: {error}</div>}

      {loading && !scan && (
        <div className="loading">Scanning local Claude &amp; Codex data…</div>
      )}

      {scan && pricing && aggregates && (
        <>
          {tab !== 'pricing' && (
            <Filters
              filter={filter}
              onChange={setFilter}
              availableSources={availableSources}
              days={aggregates.byDay}
            />
          )}
          <main className="content">
            {tab === 'dashboard' && (
              <>
                <Dashboard aggregates={aggregates} pricing={pricing} />
                <DesktopGap gaps={scan.desktopGaps} />
              </>
            )}
            {tab === 'models' && (
              <ModelBreakdown models={aggregates.byModel} pricing={pricing} />
            )}
            {tab === 'sessions' && (
              <SessionList sessions={aggregates.sessions} records={scan.records} pricing={pricing} />
            )}
            {tab === 'pricing' && (
              <PricingEditor
                pricing={pricing}
                onSaved={(p) => setPricing(p)}
                usedModels={aggregates.byModel.map((m) => m.model)}
              />
            )}
          </main>
          {scan.warnings.length > 0 && tab === 'dashboard' && (
            <details className="warnings">
              <summary>{scan.warnings.length} warning(s) during scan</summary>
              <ul>
                {scan.warnings.slice(0, 50).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}