import { app } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { PricingTable, PricingEntry } from '@shared/types'

/**
 * Pricing lives in a user-editable JSON file under userData, seeded on first
 * run from the bundled default. This lets the user correct/add rates without
 * a rebuild.
 */

function userPricingPath(): string {
  return join(app.getPath('userData'), 'pricing.json')
}

function bundledDefaultPath(): string {
  // In dev, resources/ sits at the project root; when packaged, electron-builder
  // copies it to process.resourcesPath/resources.
  const packaged = join(process.resourcesPath, 'resources', 'pricing.default.json')
  const dev = join(app.getAppPath(), 'resources', 'pricing.default.json')
  return app.isPackaged ? packaged : dev
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await fs.readFile(path, 'utf8')
  return JSON.parse(raw) as T
}

export async function loadDefaultPricing(): Promise<PricingTable> {
  return readJson<PricingTable>(bundledDefaultPath())
}

export async function loadPricing(): Promise<PricingTable> {
  try {
    return await readJson<PricingTable>(userPricingPath())
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
