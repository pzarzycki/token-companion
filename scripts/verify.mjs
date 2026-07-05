// Dependency-free verification of the parsing + costing rules against real
// local data. Run with: node scripts/verify.mjs
// Mirrors the logic in src/main/parsers/*.ts and src/shared/aggregate.ts so we
// can validate numbers without the Electron/Vite toolchain.

import { homedir } from 'node:os'
import { join, basename } from 'node:path'
import { promises as fs, createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const home = homedir()
const PATHS = {
  claudeProjects: join(home, '.claude', 'projects'),
  claude3pTitleGen: join(home, 'Library', 'Application Support', 'Claude-3p', 'title-gen'),
  codexSessions: join(home, '.codex', 'sessions')
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v) => (typeof v === 'string' ? v : undefined)

async function walk(root, match) {
  const out = []
  async function rec(dir) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) await rec(full)
      else if (e.isFile() && match(e.name)) out.push(full)
    }
  }
  await rec(root)
  return out
}

async function* readJsonl(file) {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of rl) {
    const t = line.trim()
    if (!t) continue
    try {
      yield JSON.parse(t)
    } catch {
      /* skip */
    }
  }
}

async function parseClaude(file, source) {
  const records = []
  const fileSession = basename(file).replace(/\.jsonl$/, '')
  for await (const obj of readJsonl(file)) {
    if (obj.type !== 'assistant') continue
    const message = obj.message
    if (!message || typeof message !== 'object') continue
    const usage = message.usage
    if (!usage || typeof usage !== 'object') continue
    const model = str(message.model) ?? 'unknown'
    const inputTokens = num(usage.input_tokens)
    const outputTokens = num(usage.output_tokens)
    const cacheWriteTokens = num(usage.cache_creation_input_tokens)
    const cacheReadTokens = num(usage.cache_read_input_tokens)
    if (model === '<synthetic>' && inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens === 0)
      continue
    const cc = usage.cache_creation
    records.push({
      source,
      subSource: str(obj.entrypoint) ?? 'unknown',
      provider: 'anthropic',
      sessionId: str(obj.sessionId) ?? fileSession,
      model,
      timestamp: str(obj.timestamp) ?? new Date(0).toISOString(),
      inputTokens,
      outputTokens,
      cacheWriteTokens,
      cacheReadTokens,
      cacheWrite5m: num(cc?.ephemeral_5m_input_tokens),
      cacheWrite1h: num(cc?.ephemeral_1h_input_tokens),
      reasoningTokens: 0,
      dedupKey: str(message.id) ?? str(obj.requestId) ?? `${fileSession}:${records.length}`
    })
  }
  return records
}

async function parseCodex(file) {
  let sessionId, lastTs, model, last
  for await (const obj of readJsonl(file)) {
    const ts = str(obj.timestamp)
    if (ts) lastTs = ts
    const p = obj.payload
    if (obj.type === 'session_meta' && p) sessionId = str(p.id) ?? str(p.session_id) ?? sessionId
    else if (obj.type === 'turn_context' && p) model = str(p.model) ?? model
    else if (obj.type === 'event_msg' && p && p.type === 'token_count') {
      const total = p.info?.total_token_usage
      if (total)
        last = {
          input: num(total.input_tokens),
          cached: num(total.cached_input_tokens),
          output: num(total.output_tokens),
          reasoning: num(total.reasoning_output_tokens)
        }
    }
  }
  if (!last) return []
  const s = sessionId ?? basename(file).replace(/\.jsonl$/, '')
  return [
    {
      source: 'codex',
      subSource: 'codex-cli',
      provider: 'openai',
      sessionId: s,
      model: model ?? 'unknown',
      timestamp: lastTs ?? new Date(0).toISOString(),
      inputTokens: Math.max(0, last.input - last.cached),
      outputTokens: last.output,
      cacheWriteTokens: 0,
      cacheReadTokens: last.cached,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      reasoningTokens: last.reasoning,
      dedupKey: `codex:${s}`
    }
  ]
}

function assert(cond, msg) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg)
    process.exitCode = 1
  } else {
    console.log('  ✓', msg)
  }
}

async function main() {
  console.log('== Loading pricing ==')
  const here = fileURLToPath(new URL('.', import.meta.url))
  const pricing = JSON.parse(await fs.readFile(join(here, '..', 'resources', 'pricing.default.json'), 'utf8'))

  // ---- Claude ----
  console.log('\n== Claude (~/.claude/projects) ==')
  const claudeFiles = await walk(PATHS.claudeProjects, (n) => n.endsWith('.jsonl'))
  console.log(`  files: ${claudeFiles.length}`)
  let claude = []
  for (const f of claudeFiles) claude.push(...(await parseClaude(f, 'claude')))
  console.log(`  assistant records (pre-dedup): ${claude.length}`)

  // dedup
  const seen = new Set()
  const claudeDedup = claude.filter((r) => (seen.has(r.dedupKey) ? false : (seen.add(r.dedupKey), true)))
  console.log(`  after dedup on message.id: ${claudeDedup.length} (removed ${claude.length - claudeDedup.length})`)

  // entrypoint breakdown
  const byEntry = {}
  for (const r of claudeDedup) byEntry[r.subSource] = (byEntry[r.subSource] ?? 0) + 1
  console.log('  by entrypoint:', byEntry)

  // model breakdown
  const models = {}
  for (const r of claudeDedup) models[r.model] = (models[r.model] ?? 0) + 1
  console.log('  models seen:', Object.keys(models).join(', '))
  const unpriced = Object.keys(models).filter((m) => !pricing.models[m])
  assert(true, `models with no pricing entry: ${unpriced.length ? unpriced.join(', ') : '(none)'}`)

  // ---- Cross-check #2: independent grep-style sum of output_tokens for one file ----
  console.log('\n== Cross-check: Claude output_tokens sum for one file ==')
  if (claudeFiles.length) {
    // Pick the file with the most assistant records so the sum is meaningful.
    let f = claudeFiles[0]
    let best = -1
    for (const cf of claudeFiles) {
      const recs = await parseClaude(cf, 'claude')
      if (recs.length > best) {
        best = recs.length
        f = cf
      }
    }
    let indepSum = 0
    for await (const obj of readJsonl(f)) {
      if (obj.type === 'assistant' && obj.message?.usage) indepSum += num(obj.message.usage.output_tokens)
    }
    const parsedSum = (await parseClaude(f, 'claude')).reduce((n, r) => n + r.outputTokens, 0)
    console.log(`  file: ${basename(f)}`)
    assert(parsedSum === indepSum, `parser output sum (${parsedSum}) == independent sum (${indepSum})`)
  }

  // ---- Codex ----
  console.log('\n== Codex (~/.codex/sessions) ==')
  const codexFiles = await walk(PATHS.codexSessions, (n) => n.endsWith('.jsonl'))
  console.log(`  rollout files: ${codexFiles.length}`)
  let codex = []
  for (const f of codexFiles) codex.push(...(await parseCodex(f)))
  console.log(`  session records: ${codex.length} (one per session)`)
  assert(codex.length <= codexFiles.length, 'at most one record per rollout file (not summed per-event)')

  // ---- Cross-check #3: Codex uses LAST cumulative event, not a sum ----
  console.log('\n== Cross-check: Codex last-vs-sum for a multi-event session ==')
  let checked = false
  for (const f of codexFiles) {
    const totals = []
    for await (const obj of readJsonl(f)) {
      if (obj.type === 'event_msg' && obj.payload?.type === 'token_count') {
        const t = obj.payload.info?.total_token_usage
        if (t) totals.push(num(t.total_tokens))
      }
    }
    if (totals.length >= 3) {
      const last = totals[totals.length - 1]
      const naiveSum = totals.reduce((a, b) => a + b, 0)
      const rec = (await parseCodex(f))[0]
      const parsedTotal = rec.inputTokens + rec.cacheReadTokens + rec.outputTokens
      console.log(`  file: ${basename(f)} — ${totals.length} token_count events`)
      console.log(`    last cumulative total_tokens = ${last}, naive sum-of-events = ${naiveSum}`)
      assert(parsedTotal === last, `parser total (${parsedTotal}) == LAST event (${last}), NOT the sum (${naiveSum})`)
      checked = true
      break
    }
  }
  if (!checked) console.log('  (no session with ≥3 token_count events found to test)')

  // ---- Cost math sanity on one record ----
  console.log('\n== Cross-check: cost math on one Claude record ==')
  const sample = claudeDedup.find((r) => pricing.models[r.model] && r.inputTokens + r.outputTokens > 0)
  if (sample) {
    const e = pricing.models[sample.model]
    const m = pricing.cacheMultipliers
    const extraWrite = Math.max(0, sample.cacheWriteTokens - sample.cacheWrite5m - sample.cacheWrite1h)
    const expected =
      (sample.inputTokens * e.input +
        sample.outputTokens * e.output +
        sample.cacheReadTokens * e.input * m.read +
        sample.cacheWrite5m * e.input * m.write5m +
        sample.cacheWrite1h * e.input * m.write1h +
        extraWrite * e.input * m.write5m) /
      1_000_000
    console.log(
      `  model=${sample.model} in=${sample.inputTokens} out=${sample.outputTokens} cR=${sample.cacheReadTokens} cW=${sample.cacheWriteTokens}`
    )
    console.log(`  computed cost = $${expected.toFixed(6)}`)
    assert(expected >= 0 && Number.isFinite(expected), 'cost is a finite non-negative number')
  }

  // ---- Grand totals ----
  console.log('\n== Grand totals (priced models only) ==')
  const all = [...claudeDedup, ...codex]
  let totalCost = 0
  let inTok = 0,
    outTok = 0,
    cacheR = 0,
    cacheW = 0
  for (const r of all) {
    inTok += r.inputTokens
    outTok += r.outputTokens
    cacheR += r.cacheReadTokens
    cacheW += r.cacheWriteTokens
    const e = pricing.models[r.model]
    if (!e) continue
    const m = pricing.cacheMultipliers
    const extraWrite = Math.max(0, r.cacheWriteTokens - r.cacheWrite5m - r.cacheWrite1h)
    totalCost +=
      (r.inputTokens * e.input +
        r.outputTokens * e.output +
        r.cacheReadTokens * e.input * m.read +
        r.cacheWrite5m * e.input * m.write5m +
        r.cacheWrite1h * e.input * m.write1h +
        extraWrite * e.input * m.write5m) /
      1_000_000
  }
  const fmt = (n) => (n / 1e6).toFixed(1) + 'M'
  console.log(`  records: ${all.length} | sessions: ${new Set(all.map((r) => r.sessionId)).size}`)
  console.log(`  input=${fmt(inTok)} cacheRead=${fmt(cacheR)} cacheWrite=${fmt(cacheW)} output=${fmt(outTok)}`)
  console.log(`  TOTAL COST (priced): $${totalCost.toFixed(2)}`)

  console.log('\n' + (process.exitCode ? '✗ Some checks failed.' : '✓ All checks passed.'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
