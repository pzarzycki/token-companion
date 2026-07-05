import type { ScanResult, UsageRecord, DesktopGapEntry } from '@shared/types'
import { sourcePaths, walkFiles, isJsonl } from './sources'
import { parseClaudeFile } from './parsers/claudeJsonl'
import { parseCodexFile } from './parsers/codexJsonl'
import { probeDesktopStore } from './parsers/leveldbProbe'

/** Concurrency cap for file parsing. */
const CONCURRENCY = 8

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function dedupe(records: UsageRecord[]): UsageRecord[] {
  const seen = new Set<string>()
  const out: UsageRecord[] = []
  for (const r of records) {
    if (seen.has(r.dedupKey)) continue
    seen.add(r.dedupKey)
    out.push(r)
  }
  return out
}

export async function scanAll(): Promise<ScanResult> {
  const paths = sourcePaths()
  const warnings: string[] = []
  const allRecords: UsageRecord[] = []

  // --- Claude (CLI + desktop agent + vscode), shared folder ---
  const claudeFiles = await walkFiles(paths.claudeProjects, isJsonl)
  const claudeResults = await mapLimit(claudeFiles, CONCURRENCY, async (f) => {
    try {
      return await parseClaudeFile(f, 'claude')
    } catch (e) {
      warnings.push(`Failed to parse ${f}: ${(e as Error).message}`)
      return [] as UsageRecord[]
    }
  })
  for (const r of claudeResults) allRecords.push(...r)

  // --- Claude 3p title-gen JSONL ---
  const titleGenFiles = await walkFiles(paths.claude3pTitleGen, isJsonl)
  const titleGenResults = await mapLimit(titleGenFiles, CONCURRENCY, async (f) => {
    try {
      return await parseClaudeFile(f, 'claude-3p')
    } catch (e) {
      warnings.push(`Failed to parse ${f}: ${(e as Error).message}`)
      return [] as UsageRecord[]
    }
  })
  for (const r of titleGenResults) allRecords.push(...r)

  // --- Codex CLI rollouts ---
  const codexFiles = await walkFiles(paths.codexSessions, isJsonl)
  const codexResults = await mapLimit(codexFiles, CONCURRENCY, async (f) => {
    try {
      return await parseCodexFile(f)
    } catch (e) {
      warnings.push(`Failed to parse ${f}: ${(e as Error).message}`)
      return [] as UsageRecord[]
    }
  })
  for (const r of codexResults) allRecords.push(...r)

  const records = dedupe(allRecords)

  // --- Desktop gap discovery (no token data) ---
  const desktopGaps: DesktopGapEntry[] = []
  for (const store of paths.desktopStores) {
    try {
      const entries = await probeDesktopStore(store.app, store.path)
      desktopGaps.push(...entries)
    } catch (e) {
      warnings.push(`Desktop probe failed for ${store.app}: ${(e as Error).message}`)
    }
  }

  return {
    records,
    desktopGaps,
    scannedAt: new Date().toISOString(),
    warnings
  }
}
