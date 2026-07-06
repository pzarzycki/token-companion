import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import type {
  AppInfo,
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
const UPDATE_COMMAND = 'npx token-companion@latest'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'models', label: 'Models' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'pricing', label: 'Pricing' }
]

export function App(): React.JSX.Element {
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [pricing, setPricing] = useState<PricingTable | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
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

  useEffect(() => {
    let cancelled = false

    async function loadAppInfo(): Promise<void> {
      try {
        const info = await window.api.getAppInfo()
        if (!cancelled) setAppInfo(info)
      } catch (e) {
        console.error('Failed to load app info', e)
      }
    }

    void loadAppInfo()
    const unsubscribe = window.api.onAppInfoChanged((info) => {
      if (!cancelled) setAppInfo(info)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isUpdateModalOpen) return

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsUpdateModalOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isUpdateModalOpen])

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
        <div className="topbar-right">
          <div className="app-meta">
            <a
              className="topbar-link"
              href={appInfo?.repoUrl ?? 'https://github.com/pzarzycki/token-companion'}
              title="Open the Token Companion project on GitHub"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <span
              className="version-chip"
              title={
                appInfo?.latestVersion && appInfo.hasUpdate
                  ? `Current version ${appInfo.version}. Latest version ${appInfo.latestVersion} is available.`
                  : `Current version ${appInfo?.version ?? 'loading...'}`
              }
            >
              v{appInfo?.version ?? '...'}
            </span>
            {appInfo?.hasUpdate && (
              <button
                className="update-link"
                type="button"
                title={`Show update instructions for v${appInfo.latestVersion}`}
                onClick={() => setIsUpdateModalOpen(true)}
              >
                Update available
              </button>
            )}
          </div>
          <button className="refresh" onClick={() => void loadAll()} disabled={loading}>
            {loading ? 'Scanning…' : '↻ Rescan'}
          </button>
        </div>
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

      {appInfo?.hasUpdate && appInfo.latestVersion && isUpdateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUpdateModalOpen(false)}>
          <section
            className="update-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-modal-title"
            aria-describedby="update-modal-description"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Close update dialog"
              onClick={() => setIsUpdateModalOpen(false)}
            >
              ×
            </button>
            <div className="modal-kicker">New version detected</div>
            <h2 id="update-modal-title">Token Companion v{appInfo.latestVersion} is available</h2>
            <p id="update-modal-description" className="modal-copy">
              Your current app version is v{appInfo.version}. Token Companion updates are installed
              from a terminal rather than inside the desktop app.
            </p>
            <div className="update-version-row" aria-label="Version comparison">
              <div className="update-version-card">
                <span className="update-version-label">Installed</span>
                <strong>v{appInfo.version}</strong>
              </div>
              <div className="update-version-arrow" aria-hidden="true">
                →
              </div>
              <div className="update-version-card update-version-card-latest">
                <span className="update-version-label">Latest</span>
                <strong>v{appInfo.latestVersion}</strong>
              </div>
            </div>
            <div className="terminal-card">
              <div className="terminal-card-head">
                <span className="terminal-dot terminal-dot-red" />
                <span className="terminal-dot terminal-dot-amber" />
                <span className="terminal-dot terminal-dot-green" />
                <span className="terminal-label">Terminal</span>
              </div>
              <pre className="update-command" aria-label="Install command">
                <code>{UPDATE_COMMAND}</code>
              </pre>
            </div>
            <p className="modal-note">
              Run that command in your terminal to fetch the newest published installer package and
              follow the checked-in install flow.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="primary"
                onClick={() => setIsUpdateModalOpen(false)}
              >
                Close
              </button>
            </div>
            <a
              className="modal-footer-link"
              href={appInfo.repoUrl}
              title="Open the Token Companion project on GitHub"
              target="_blank"
              rel="noreferrer"
            >
              View the project on GitHub
            </a>
          </section>
        </div>
      )}
    </div>
  )
}
