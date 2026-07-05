import type React from 'react'
import { useState } from 'react'
import type { PricingTable, PricingEntry } from '@shared/types'

interface Props {
  pricing: PricingTable
  usedModels: string[]
  onSaved: (p: PricingTable) => void
}

export function PricingEditor({ pricing, usedModels, onSaved }: Props): React.JSX.Element {
  const [draft, setDraft] = useState<PricingTable>(() => structuredClone(pricing))
  const [status, setStatus] = useState<string | null>(null)
  const [newModel, setNewModel] = useState('')

  const modelIds = Object.keys(draft.models).sort()
  // Surface used models that have no pricing entry so the user can add them.
  const missing = usedModels.filter((m) => !draft.models[m])

  function updateEntry(model: string, patch: Partial<PricingEntry>): void {
    setDraft((d) => ({
      ...d,
      models: { ...d.models, [model]: { ...d.models[model], ...patch } }
    }))
  }

  function updateMultiplier(key: keyof PricingTable['cacheMultipliers'], value: number): void {
    setDraft((d) => ({ ...d, cacheMultipliers: { ...d.cacheMultipliers, [key]: value } }))
  }

  function addModel(id: string): void {
    const trimmed = id.trim()
    if (!trimmed || draft.models[trimmed]) return
    setDraft((d) => ({
      ...d,
      models: { ...d.models, [trimmed]: { input: 0, output: 0, verify: true } }
    }))
    setNewModel('')
  }

  async function save(): Promise<void> {
    try {
      const saved = await window.api.savePricing(draft)
      onSaved(saved)
      setStatus('Saved.')
      setTimeout(() => setStatus(null), 2000)
    } catch (e) {
      setStatus('Save failed: ' + (e as Error).message)
    }
  }

  async function reset(): Promise<void> {
    const def = await window.api.resetPricing()
    setDraft(structuredClone(def))
    onSaved(def)
    setStatus('Reset to defaults.')
    setTimeout(() => setStatus(null), 2000)
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Pricing (USD per million tokens)</h2>
        <div className="actions">
          {status && <span className="status">{status}</span>}
          <button className="chip" onClick={() => void reset()}>Reset defaults</button>
          <button className="primary" onClick={() => void save()}>Save</button>
        </div>
      </div>

      <div className="multipliers">
        <span className="filter-label">Cache multipliers (× input rate):</span>
        {(['read', 'write5m', 'write1h'] as const).map((k) => (
          <label key={k} className="mult">
            {k}
            <input
              type="number"
              step="0.05"
              value={draft.cacheMultipliers[k]}
              onChange={(e) => updateMultiplier(k, Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      {missing.length > 0 && (
        <div className="banner warn">
          Used but unpriced: {missing.map((m) => (
            <button key={m} className="chip" onClick={() => addModel(m)}>+ {m}</button>
          ))}
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Model ID</th>
            <th>Label</th>
            <th className="num">Input $/M</th>
            <th className="num">Output $/M</th>
            <th>Verify</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {modelIds.map((id) => {
            const e = draft.models[id]
            return (
              <tr key={id}>
                <td className="model-name">{id}</td>
                <td>
                  <input
                    className="cell-input"
                    value={e.label ?? ''}
                    onChange={(ev) => updateEntry(id, { label: ev.target.value })}
                  />
                </td>
                <td className="num">
                  <input
                    className="cell-input num"
                    type="number"
                    step="0.01"
                    value={e.input}
                    onChange={(ev) => updateEntry(id, { input: Number(ev.target.value) })}
                  />
                </td>
                <td className="num">
                  <input
                    className="cell-input num"
                    type="number"
                    step="0.01"
                    value={e.output}
                    onChange={(ev) => updateEntry(id, { output: Number(ev.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={e.verify ?? false}
                    onChange={(ev) => updateEntry(id, { verify: ev.target.checked })}
                  />
                </td>
                <td className="gap-note">{e.note ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="add-model">
        <input
          className="cell-input"
          placeholder="add model id, e.g. gpt-5-codex"
          value={newModel}
          onChange={(e) => setNewModel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addModel(newModel)
          }}
        />
        <button className="chip" onClick={() => addModel(newModel)}>Add model</button>
      </div>
    </div>
  )
}