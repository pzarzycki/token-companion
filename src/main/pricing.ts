import { app } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import defaultPricingJson from '../../resources/pricing.default.json'
import type { PricingTable, PricingEntry } from '@shared/types'

/**
 * Pricing lives in a user-editable JSON file under userData, seeded on first run
 * from a bundled JSON import. This lets the user correct/add rates without a
 * rebuild and keeps packaging independent from extraResources layouts.
 */

const DEFAULT_PRICING = defaultPricingJson as PricingTable

function userPricingPath(): string {
  return join(app.getPath('userData'), 'pricing.json')
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await fs.readFile(path, 'utf8')
  return JSON.parse(raw) as T
}

export async function loadDefaultPricing(): Promise<PricingTable> {
  return JSON.parse(JSON.stringify(DEFAULT_PRICING)) as PricingTable
}

function mergeMissingDefaults(
  existing: PricingTable,
  defaults: PricingTable
): { table: PricingTable; changed: boolean } {
  let changed = false

  const merged: PricingTable = {
    cacheMultipliers: {
      read: existing.cacheMultipliers?.read ?? defaults.cacheMultipliers.read,
      write5m: existing.cacheMultipliers?.write5m ?? defaults.cacheMultipliers.write5m,
      write1h: existing.cacheMultipliers?.write1h ?? defaults.cacheMultipliers.write1h
    },
    models: { ...existing.models }
  }

  for (const [model, entry] of Object.entries(defaults.models)) {
    if (!merged.models[model]) {
      merged.models[model] = JSON.parse(JSON.stringify(entry)) as PricingEntry
      changed = true
    }
  }

  if (
    merged.cacheMultipliers.read !== existing.cacheMultipliers?.read ||
    merged.cacheMultipliers.write5m !== existing.cacheMultipliers?.write5m ||
    merged.cacheMultipliers.write1h !== existing.cacheMultipliers?.write1h
  ) {
    changed = true
  }

  return { table: merged, changed }
}

export async function loadPricing(): Promise<PricingTable> {
  try {
    const existing = await readJson<PricingTable>(userPricingPath())
    const defaults = await loadDefaultPricing()
    const merged = mergeMissingDefaults(existing, defaults)
    if (merged.changed) {
      await savePricing(merged.table)
    }
    return merged.table
  } catch {
    // First run (or corrupted): fall back to bundled default and persist it.
    const def = await loadDefaultPricing()
    await savePricing(def)
    return def
  }
}

export async function savePricing(table: PricingTable): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(userPricingPath(), JSON.stringify(table, null, 2), 'utf8')
}

export async function resetPricing(): Promise<PricingTable> {
  const def = await loadDefaultPricing()
  await savePricing(def)
  return def
}

export function lookupModel(
  table: PricingTable,
  model: string
): PricingEntry | undefined {
  return table.models[model]
}
