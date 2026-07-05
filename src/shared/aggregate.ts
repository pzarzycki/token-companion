import type {
  UsageRecord,
  PricingTable,
  Aggregates,
  AggregateFilter,
  ModelAggregate,
  SessionAggregate,
  DailyAggregate,
  SourceAggregate,
  CostedTotals,
  Provider
} from './types'

/**
 * Pure aggregation + costing. Given normalized records and a pricing table,
 * produce all the roll-ups the UI needs. No Electron/Node dependencies so it
 * can run in the renderer and be unit-tested directly.
 *
 * Token model notes:
 *  - Claude: input/output/cacheWrite/cacheRead are distinct, additive categories.
 *  - Codex: reasoningTokens is a SUBSET of outputTokens (not additive). We keep
 *    it only for display; totalTokens and cost use output, never output+reasoning.
 */

const MILLION = 1_000_000

function emptyCosted(): CostedTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    cost: 0,
    hasUnpricedModel: false
  }
}

/** Cost of a single record; null when the model has no pricing entry. */
export function recordCost(record: UsageRecord, pricing: PricingTable): number | null {
  const entry = pricing.models[record.model]
  if (!entry) return null
  const m = pricing.cacheMultipliers
  const usd =
    record.inputTokens * entry.input +
    record.outputTokens * entry.output +
    record.cacheReadTokens * entry.input * m.read +
    record.cacheWrite5m * entry.input * m.write5m +
    record.cacheWrite1h * entry.input * m.write1h +
    // Claude reports cacheWriteTokens without ephemeral split sometimes; charge
    // the remainder at the 5m rate (the common default) so nothing is free.
    Math.max(0, record.cacheWriteTokens - record.cacheWrite5m - record.cacheWrite1h) *
      entry.input *
      m.write5m
  return usd / MILLION
}

function addRecord(acc: CostedTotals, record: UsageRecord, cost: number | null): void {
  acc.inputTokens += record.inputTokens
  acc.outputTokens += record.outputTokens
  acc.cacheWriteTokens += record.cacheWriteTokens
  acc.cacheReadTokens += record.cacheReadTokens
  acc.reasoningTokens += record.reasoningTokens
  acc.totalTokens +=
    record.inputTokens +
    record.outputTokens +
    record.cacheWriteTokens +
    record.cacheReadTokens
  if (cost === null) {
    acc.hasUnpricedModel = true
  } else if (acc.cost !== null) {
    acc.cost += cost
  }
}

function dayOf(iso: string): string {
  // Records are ISO 8601; slice the date. Guard bad values.
  return iso.length >= 10 ? iso.slice(0, 10) : '0000-00-00'
}

function passesFilter(record: UsageRecord, filter?: AggregateFilter): boolean {
  if (!filter) return true
  if (filter.sources && filter.sources.length > 0 && !filter.sources.includes(record.source)) {
    return false
  }
  const day = dayOf(record.timestamp)
  if (filter.fromDate && day < filter.fromDate) return false
  if (filter.toDate && day > filter.toDate) return false
  return true
}

export function aggregate(
  records: UsageRecord[],
  pricing: PricingTable,
  filter?: AggregateFilter
): Aggregates {
  const overall = emptyCosted()
  const byModel = new Map<string, ModelAggregate>()
  const bySource = new Map<string, SourceAggregate>()
  const byDay = new Map<string, DailyAggregate>()
  const sessions = new Map<string, SessionAggregate>()

  for (const record of records) {
    if (!passesFilter(record, filter)) continue
    const cost = recordCost(record, pricing)

    addRecord(overall, record, cost)

    // by model
    let mAgg = byModel.get(record.model)
    if (!mAgg) {
      mAgg = {
        ...emptyCosted(),
        model: record.model,
        provider: record.provider,
        recordCount: 0,
        pricingUnverified: pricing.models[record.model]?.verify === true
      }
      byModel.set(record.model, mAgg)
    }
    addRecord(mAgg, record, cost)
    mAgg.recordCount++

    // by source (source + subSource)
    const srcKey = `${record.source}::${record.subSource}`
    let sAgg = bySource.get(srcKey)
    if (!sAgg) {
      sAgg = {
        ...emptyCosted(),
        source: record.source,
        subSource: record.subSource,
        recordCount: 0,
        sessionCount: 0
      }
      bySource.set(srcKey, sAgg)
    }
    addRecord(sAgg, record, cost)
    sAgg.recordCount++

    // by day
    const day = dayOf(record.timestamp)
    let dAgg = byDay.get(day)
    if (!dAgg) {
      dAgg = { ...emptyCosted(), date: day }
      byDay.set(day, dAgg)
    }
    addRecord(dAgg, record, cost)

    // by session
    let sessAgg = sessions.get(record.sessionId)
    if (!sessAgg) {
      sessAgg = {
        ...emptyCosted(),
        sessionId: record.sessionId,
        source: record.source,
        subSource: record.subSource,
        provider: record.provider,
        models: [],
        cwd: record.cwd,
        firstTimestamp: record.timestamp,
        lastTimestamp: record.timestamp,
        recordCount: 0
      }
      sessions.set(record.sessionId, sessAgg)
    }
    addRecord(sessAgg, record, cost)
    sessAgg.recordCount++
    if (!sessAgg.models.includes(record.model)) sessAgg.models.push(record.model)
    if (record.timestamp < sessAgg.firstTimestamp) sessAgg.firstTimestamp = record.timestamp
    if (record.timestamp > sessAgg.lastTimestamp) sessAgg.lastTimestamp = record.timestamp
    if (!sessAgg.cwd && record.cwd) sessAgg.cwd = record.cwd
  }

  // session counts per source
  for (const sess of sessions.values()) {
    const srcKey = `${sess.source}::${sess.subSource}`
    const sAgg = bySource.get(srcKey)
    if (sAgg) sAgg.sessionCount++
  }

  const sortByCostDesc = <T extends { cost: number | null; totalTokens: number }>(
    a: T,
    b: T
  ): number => (b.cost ?? 0) - (a.cost ?? 0) || b.totalTokens - a.totalTokens

  return {
    overall,
    byModel: [...byModel.values()].sort(sortByCostDesc),
    bySource: [...bySource.values()].sort(sortByCostDesc),
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    sessions: [...sessions.values()].sort((a, b) =>
      b.lastTimestamp.localeCompare(a.lastTimestamp)
    ),
    sessionCount: sessions.size,
    recordCount: overall
      ? byModel.size === 0
        ? 0
        : [...byModel.values()].reduce((n, m) => n + m.recordCount, 0)
      : 0
  }
}

export function providerLabel(p: Provider): string {
  return p === 'anthropic' ? 'Anthropic' : 'OpenAI'
}
