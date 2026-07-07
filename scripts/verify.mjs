// Dependency-free verification of the parsing + costing rules against real
// local data. Run with: node scripts/verify.mjs
// Mirrors the logic in src/main/parsers/*.ts and src/shared/aggregate.ts so we
// can validate numbers without the Electron/Vite toolchain.

import { homedir } from 'node:os'
import { join, basename, dirname, relative, resolve, isAbsolute } from 'node:path'
import { promises as fs, createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const home = homedir()
const PATHS = {
  claudeProjects: join(home, '.claude', 'projects'),
  claude3pTitleGen: join(home, 'Library', 'Application Support', 'Claude-3p', 'title-gen'),
  claudeCoworkSessions: join(home, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions'),
  codexSessions: join(home, '.codex', 'sessions')
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v) => (typeof v === 'string' ? v : undefined)

function isPathInsideRoot(filePath, root) {
  const rel = relative(resolve(root), resolve(filePath))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function isAllowedSessionFile(filePath, source) {
  if (source === 'codex') return filePath.endsWith('.jsonl') && isPathInsideRoot(filePath, PATHS.codexSessions)
  if (source === 'claude-3p') {
    return (
      filePath.endsWith('.jsonl') &&
      (isPathInsideRoot(filePath, PATHS.claude3pTitleGen) ||
        isPathInsideRoot(filePath, PATHS.claudeProjects))
    )
  }
  if (isPathInsideRoot(filePath, PATHS.claudeCoworkSessions)) {
    return filePath.endsWith('/audit.jsonl')
  }
  return filePath.endsWith('.jsonl') && isPathInsideRoot(filePath, PATHS.claudeProjects)
}

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

async function parseCowork(file) {
  const records = []
  const sessionDir = dirname(file)
  const localSessionId = basename(sessionDir)
  let metadata = {}
  try {
    metadata = JSON.parse(await fs.readFile(join(dirname(sessionDir), `${basename(sessionDir)}.json`), 'utf8'))
  } catch {
    /* metadata is optional */
  }
  const sessionId = str(metadata.sessionId) ?? localSessionId
  const assistantByLink = new Map()
  let lastAssistantLink
  for await (const obj of readJsonl(file)) {
    if (obj.type === 'assistant') {
      const message = obj.message
      const usage = message?.usage
      if (!usage) continue
      const link = str(message.id) ?? str(obj.request_id) ?? str(obj.requestId) ?? str(obj.uuid)
      if (!link) continue
      lastAssistantLink = link
      assistantByLink.set(link, {
        link,
        model: str(message.model) ?? str(metadata.model) ?? 'unknown',
        timestamp: str(obj.timestamp) ?? new Date(0).toISOString(),
        usage
      })
      continue
    }
    if (obj.type !== 'result') continue
    const link = lastAssistantLink ?? str(obj.uuid) ?? `${sessionId}:${records.length}`
    const timestamp = str(obj.timestamp) ?? new Date(0).toISOString()
    const modelUsage = obj.modelUsage
    if (modelUsage && typeof modelUsage === 'object' && Object.keys(modelUsage).length) {
      const entries = Object.entries(modelUsage)
      for (const [model, usage] of entries) {
        const cc = usage.cache_creation
        records.push({
          source: 'claude',
          subSource: 'claude-cowork',
          provider: 'anthropic',
          sessionId,
          model,
          timestamp,
          inputTokens: num(usage.inputTokens),
          outputTokens: num(usage.outputTokens),
          cacheWriteTokens: num(usage.cacheCreationInputTokens),
          cacheReadTokens: num(usage.cacheReadInputTokens),
          cacheWrite5m: num(cc?.ephemeral_5m_input_tokens),
          cacheWrite1h: num(cc?.ephemeral_1h_input_tokens),
          reasoningTokens: 0,
          cwd: str(metadata.cwd),
          sessionTitle: str(metadata.title),
          filePath: file,
          actualCostUsd: typeof usage.costUSD === 'number' ? usage.costUSD : undefined,
          conversationRequestId: link,
          dedupKey: entries.length === 1 ? link : `${link}:${model}`
        })
      }
      continue
    }
    const usage = obj.usage
    if (!usage) continue
    const cc = usage.cache_creation
    records.push({
      source: 'claude',
      subSource: 'claude-cowork',
      provider: 'anthropic',
      sessionId,
      model: str(metadata.model) ?? assistantByLink.get(link)?.model ?? 'unknown',
      timestamp,
      inputTokens: num(usage.input_tokens),
      outputTokens: num(usage.output_tokens),
      cacheWriteTokens: num(usage.cache_creation_input_tokens),
      cacheReadTokens: num(usage.cache_read_input_tokens),
      cacheWrite5m: num(cc?.ephemeral_5m_input_tokens),
      cacheWrite1h: num(cc?.ephemeral_1h_input_tokens),
      reasoningTokens: 0,
      cwd: str(metadata.cwd),
      filePath: file,
      actualCostUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : undefined,
      conversationRequestId: link,
      dedupKey: link
    })
  }
  if (records.length) return records
  return [...assistantByLink.values()].map((r) => {
    const cc = r.usage.cache_creation
    return {
      source: 'claude',
      subSource: 'claude-cowork',
      provider: 'anthropic',
      sessionId,
      model: r.model,
      timestamp: r.timestamp,
      inputTokens: num(r.usage.input_tokens),
      outputTokens: num(r.usage.output_tokens),
      cacheWriteTokens: num(r.usage.cache_creation_input_tokens),
      cacheReadTokens: num(r.usage.cache_read_input_tokens),
      cacheWrite5m: num(cc?.ephemeral_5m_input_tokens),
      cacheWrite1h: num(cc?.ephemeral_1h_input_tokens),
      reasoningTokens: 0,
      cwd: str(metadata.cwd),
      filePath: file,
      conversationRequestId: r.link,
      dedupKey: r.link
    }
  })
}

async function parseCodex(file) {
  let sessionId, lastTs, model, last, parentSessionId, agentNickname, agentRole, subagentDepth
  let isSubagent = false
  for await (const obj of readJsonl(file)) {
    const ts = str(obj.timestamp)
    if (ts) lastTs = ts
    const p = obj.payload
    if (obj.type === 'session_meta' && p) {
      sessionId = str(p.id) ?? str(p.session_id) ?? sessionId
      const threadSpawn = p.source?.subagent?.thread_spawn
      if (p.thread_source === 'subagent' && threadSpawn) {
        parentSessionId = str(threadSpawn.parent_thread_id) ?? str(p.parent_thread_id)
        isSubagent = Boolean(parentSessionId)
        agentNickname = str(p.agent_nickname) ?? str(threadSpawn.agent_nickname)
        agentRole = str(p.agent_role) ?? str(threadSpawn.agent_role)
        subagentDepth = num(threadSpawn.depth) || undefined
      }
    }
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
      subSource: isSubagent ? 'codex-subagent' : 'codex-cli',
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
      parentSessionId,
      isSubagent: isSubagent || undefined,
      agentNickname,
      agentRole,
      subagentDepth,
      dedupKey: `codex:${s}`
    }
  ]
}

function parseContent(raw) {
  if (typeof raw === 'string') return [{ type: 'text', text: raw }]
  if (!Array.isArray(raw)) return []
  return raw.map((b) => {
    if (!b || typeof b !== 'object') return { type: 'unknown', raw: b }
    if (b.type === 'text' && typeof b.text === 'string') return { type: 'text', text: b.text }
    if (b.type === 'thinking' && typeof b.thinking === 'string') return { type: 'thinking', thinking: b.thinking }
    if (b.type === 'tool_use') return { type: 'tool_use', id: str(b.id) ?? '', name: str(b.name) ?? '', input: b.input }
    if (b.type === 'tool_result') return { type: 'tool_result', tool_use_id: str(b.tool_use_id) ?? '', content: b.content }
    return { type: 'unknown', raw: b }
  })
}

function parseCodexContent(raw) {
  if (typeof raw === 'string') return raw ? [{ type: 'text', text: raw }] : []
  if (!Array.isArray(raw)) return []
  const blocks = []
  for (const part of raw) {
    if (!part || typeof part !== 'object') continue
    if ((part.type === 'input_text' || part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
      blocks.push({ type: part.text.length > 1200 ? 'long_text' : 'text', text: part.text, label: 'Text' })
    }
  }
  return blocks
}

function codexContentText(raw) {
  return parseCodexContent(raw).map((b) => b.text).join('\n\n')
}

async function parseCodexEntries(file) {
  const entries = []
  for await (const obj of readJsonl(file)) {
    const payload = obj.payload
    const timestamp = str(obj.timestamp) ?? ''
    if (obj.type === 'session_meta') {
      entries.push({ role: 'system', subtype: 'codex-session-meta', title: 'Session metadata', timestamp, content: [], raw: obj })
      continue
    }
    if (obj.type === 'turn_context') {
      entries.push({ role: 'system', subtype: 'codex-turn-context', title: 'Turn context', timestamp, content: [], raw: obj })
      continue
    }
    if (obj.type === 'compacted') {
      entries.push({ role: 'event', subtype: 'codex-compacted', title: 'Context compacted', timestamp, content: [], raw: obj })
      continue
    }
    if (obj.type === 'event_msg' && payload) {
      if (payload.type === 'user_message' && typeof payload.message === 'string') {
        entries.push({ role: 'user', subtype: 'codex-user-message', timestamp, content: [{ type: 'text', text: payload.message }], raw: obj })
      } else if (payload.type === 'agent_message') {
        entries.push({ role: 'event', subtype: 'codex-agent-message', title: 'Agent message', timestamp, content: [], raw: obj })
      } else if (payload.type === 'token_count') {
        entries.push({ role: 'event', subtype: 'codex-token-count', title: 'Token count', timestamp, content: [], raw: obj })
      } else {
        entries.push({ role: payload.type === 'task_started' || payload.type === 'task_complete' ? 'system' : 'event', subtype: `codex-${payload.type ?? 'event'}`, timestamp, content: [], raw: obj })
      }
      continue
    }
    if (obj.type !== 'response_item' || !payload) continue
    if (payload.type === 'message') {
      const text = codexContentText(payload.content)
      if (payload.role === 'developer') {
        entries.push({ role: 'system', subtype: 'codex-developer-context', title: 'Developer context', timestamp, content: parseCodexContent(payload.content), raw: obj })
      } else if (payload.role === 'user') {
        const title = text.includes('<environment_context>') || text.includes('# AGENTS.md instructions') ? 'Environment context' : 'Model input context'
        entries.push({ role: 'system', subtype: title === 'Environment context' ? 'codex-environment-context' : 'codex-model-input', title, timestamp, content: parseCodexContent(payload.content), raw: obj })
      } else if (payload.role === 'assistant') {
        entries.push({ role: 'assistant', subtype: 'codex-assistant-message', timestamp, content: parseCodexContent(payload.content), raw: obj })
      }
    } else if (payload.type === 'reasoning') {
      entries.push({ role: 'event', subtype: 'codex-reasoning', title: 'Reasoning metadata', timestamp, content: [], raw: obj })
    } else if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      entries.push({ role: 'assistant', subtype: 'codex-tool-call', timestamp, content: [{ type: 'tool_use', name: str(payload.name) ?? 'tool', id: str(payload.call_id) ?? '' }], raw: obj })
    } else if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
      entries.push({ role: 'user', subtype: 'codex-tool-result', timestamp, content: [{ type: 'tool_result', tool_use_id: str(payload.call_id) ?? '', content: str(payload.output) ?? '' }], raw: obj })
    } else {
      entries.push({ role: 'event', subtype: `codex-${payload.type ?? 'response-item'}`, timestamp, content: [], raw: obj })
    }
  }
  return entries
}

async function summarizeCodexSubagent(file) {
  let candidate = null
  const models = new Set()
  for await (const obj of readJsonl(file)) {
    const p = obj.payload
    const timestamp = str(obj.timestamp)
    if (obj.type === 'session_meta' && p) {
      const threadSpawn = p.source?.subagent?.thread_spawn
      const parentSessionId = str(threadSpawn?.parent_thread_id) ?? str(p.parent_thread_id)
      const agentId = str(p.id)
      if (p.thread_source !== 'subagent' || !threadSpawn || !parentSessionId || !agentId) return null
      candidate = {
        file,
        agentId,
        parentSessionId,
        description: str(p.agent_nickname) ?? str(threadSpawn.agent_nickname),
        subagentType: str(p.agent_role) ?? str(threadSpawn.agent_role),
        firstTimestamp: timestamp ?? str(p.timestamp) ?? '',
        lastTimestamp: timestamp ?? str(p.timestamp) ?? '',
        progressCount: 0,
        stepCount: 0,
        models: [],
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        promptPreview: undefined,
        status: undefined
      }
      continue
    }
    if (!candidate) continue
    if (timestamp) {
      if (!candidate.firstTimestamp || timestamp < candidate.firstTimestamp) candidate.firstTimestamp = timestamp
      if (!candidate.lastTimestamp || timestamp > candidate.lastTimestamp) candidate.lastTimestamp = timestamp
    }
    if (obj.type === 'turn_context' && p) {
      if (p.model) models.add(p.model)
    } else if (obj.type === 'event_msg' && p) {
      if (p.type === 'user_message') candidate.promptPreview ??= str(p.message)?.replace(/\s+/g, ' ').trim().slice(0, 220)
      if (p.type === 'task_complete') candidate.status = 'completed'
      if (p.type === 'token_count') {
        candidate.progressCount += 1
        const total = p.info?.total_token_usage
        if (total) {
          const input = num(total.input_tokens)
          const cached = num(total.cached_input_tokens)
          candidate.inputTokens = Math.max(0, input - cached)
          candidate.cacheReadTokens = cached
          candidate.outputTokens = num(total.output_tokens)
          candidate.reasoningTokens = num(total.reasoning_output_tokens)
        }
      }
    } else if (obj.type === 'response_item' && p) {
      candidate.stepCount += 1
    }
  }
  if (!candidate) return null
  candidate.models = [...models]
  candidate.entries = await parseCodexEntries(file)
  return candidate
}

async function parseCodexSubagents(root, parentSessionId) {
  const files = await walk(root, (n) => n.endsWith('.jsonl'))
  const subagents = []
  for (const file of files) {
    const candidate = await summarizeCodexSubagent(file)
    if (candidate?.parentSessionId === parentSessionId) subagents.push(candidate)
  }
  subagents.sort((a, b) => a.firstTimestamp.localeCompare(b.firstTimestamp))
  return subagents
}

async function parseSessionEntries(file, sessionId) {
  const assistantByMsgId = new Map()
  const userByUuid = new Set()
  const entries = []
  for await (const obj of readJsonl(file)) {
    if (obj.type !== 'user' && obj.type !== 'assistant') continue
    const objSessionId = str(obj.sessionId)
    if (objSessionId && objSessionId !== sessionId) continue
    const message = obj.message
    if (!message || typeof message !== 'object') continue
    const content = parseContent(message.content)
    if (obj.type === 'assistant') {
      const linkKey = str(message.id) ?? str(obj.requestId) ?? str(obj.request_id)
      if (linkKey && assistantByMsgId.has(linkKey)) {
        assistantByMsgId.get(linkKey).content.push(...content)
        continue
      }
      const entry = {
        role: 'assistant',
        requestId: linkKey,
        model: str(message.model),
        timestamp: str(obj.timestamp) ?? '',
        content
      }
      if (linkKey) assistantByMsgId.set(linkKey, entry)
      entries.push(entry)
      continue
    }
    const uuid = str(obj.uuid) ?? ''
    if (uuid && userByUuid.has(uuid)) continue
    if (uuid) userByUuid.add(uuid)
    entries.push({ role: 'user', timestamp: str(obj.timestamp) ?? '', content })
  }
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return entries
}

async function findSubagentFiles(sessionDir) {
  const out = new Map()
  const root = join(sessionDir, '.claude', 'projects')
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
      else if (e.isFile()) {
        const match = e.name.match(/^agent-(.+)\.jsonl$/)
        if (match) out.set(match[1], full)
      }
    }
  }
  await rec(root)
  return out
}

async function parseCoworkSubagents(auditFile, sessionId) {
  const sessionDir = auditFile.split('/').slice(0, -1).join('/')
  let metadata = {}
  try {
    metadata = JSON.parse(await fs.readFile(`${sessionDir}.json`, 'utf8'))
  } catch {
    /* metadata is optional */
  }
  const cliSessionId = str(metadata.cliSessionId) ?? sessionId
  const tasks = new Map()
  for await (const obj of readJsonl(auditFile)) {
    const subtype = str(obj.subtype)
    if (!subtype?.startsWith('task_')) continue
    const taskId = str(obj.task_id)
    if (!taskId) continue
    const task =
      tasks.get(taskId) ??
      {
        taskId,
        firstTimestamp: '',
        lastTimestamp: '',
        progressCount: 0,
        stepCount: 0
      }
    const ts = str(obj.timestamp) ?? str(obj._audit_timestamp)
    if (ts) {
      if (!task.firstTimestamp || ts < task.firstTimestamp) task.firstTimestamp = ts
      if (!task.lastTimestamp || ts > task.lastTimestamp) task.lastTimestamp = ts
    }
    if (subtype === 'task_started') {
      task.toolUseId = str(obj.tool_use_id) ?? task.toolUseId
      task.description = str(obj.description) ?? task.description
      task.subagentType = str(obj.subagent_type) ?? task.subagentType
      task.taskType = str(obj.task_type) ?? task.taskType
      task.promptPreview = str(obj.prompt)?.replace(/\s+/g, ' ').trim().slice(0, 220)
    } else if (subtype === 'task_progress') {
      task.progressCount += 1
      task.stepCount = Math.max(task.stepCount, num(obj.usage?.tool_uses))
    } else if (subtype === 'task_updated' || subtype === 'task_notification') {
      task.status = str(obj.status) ?? str(obj.description) ?? task.status
    }
    tasks.set(taskId, task)
  }

  const files = await findSubagentFiles(sessionDir)
  const subagents = []
  for (const task of tasks.values()) {
    const file = files.get(task.taskId)
    const entries = file ? await parseSessionEntries(file, cliSessionId) : []
    const models = new Set()
    let inputTokens = 0,
      outputTokens = 0,
      cacheWriteTokens = 0,
      cacheReadTokens = 0
    if (file) {
      for await (const obj of readJsonl(file)) {
        const usage = obj.message?.usage
        if (obj.type !== 'assistant' || !usage) continue
        if (obj.message?.model) models.add(obj.message.model)
        inputTokens += num(usage.input_tokens)
        outputTokens += num(usage.output_tokens)
        cacheWriteTokens += num(usage.cache_creation_input_tokens)
        cacheReadTokens += num(usage.cache_read_input_tokens)
      }
    }
    subagents.push({
      ...task,
      file,
      entries,
      models: [...models],
      inputTokens,
      outputTokens,
      cacheWriteTokens,
      cacheReadTokens
    })
  }
  subagents.sort((a, b) => a.firstTimestamp.localeCompare(b.firstTimestamp))
  return subagents
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
  console.log('\n== Claude Cowork fixture ==')
  const coworkFixture = join(here, 'fixtures', 'cowork', 'local_fixture-session', 'audit.jsonl')
  const coworkFixtureRecords = await parseCowork(coworkFixture)
  assert(coworkFixtureRecords.length === 1, 'fixture emits one result-backed Cowork record')
  const coworkFixtureRecord = coworkFixtureRecords[0]
  assert(coworkFixtureRecord.sessionId === 'local_fixture-session', 'fixture keeps local Cowork session id')
  assert(coworkFixtureRecord.outputTokens === 829, 'fixture uses final result output tokens, not streamed assistant output')
  assert(coworkFixtureRecord.actualCostUsd === 0.358861, 'fixture preserves exact Claude-reported cost')
  assert(coworkFixtureRecord.conversationRequestId === 'msg_fixture', 'fixture links billing row to assistant turn')
  const coworkFixtureSubagents = await parseCoworkSubagents(coworkFixture, 'local_fixture-session')
  assert(coworkFixtureSubagents.length === 1, 'fixture discovers one Cowork subagent task')
  const fixtureSubagent = coworkFixtureSubagents[0]
  assert(fixtureSubagent.taskId === 'fixture-task', 'fixture subagent task id matches agent transcript file')
  assert(fixtureSubagent.description === 'Fixture subagent', 'fixture subagent keeps task description')
  assert(fixtureSubagent.stepCount === 1, 'fixture subagent step count comes from task progress')
  assert(fixtureSubagent.models.includes('claude-sonnet-4-6'), 'fixture subagent model is parsed from transcript')
  assert(fixtureSubagent.inputTokens === 16, 'fixture subagent display input tokens are summed from assistant usage')
  assert(fixtureSubagent.cacheReadTokens === 26, 'fixture subagent display cache-read tokens are summed from assistant usage')
  assert(fixtureSubagent.cacheWriteTokens === 22, 'fixture subagent display cache-write tokens are summed from assistant usage')
  assert(fixtureSubagent.outputTokens === 34, 'fixture subagent display output tokens are summed from assistant usage')
  assert(fixtureSubagent.entries.some((e) => e.role === 'user'), 'fixture subagent transcript includes a user prompt')
  assert(fixtureSubagent.entries.some((e) => e.role === 'assistant' && e.content.some((b) => b.type === 'text')), 'fixture subagent transcript includes assistant text')
  assert(fixtureSubagent.entries.some((e) => e.role === 'assistant' && e.content.some((b) => b.type === 'tool_use')), 'fixture subagent transcript includes tool use')
  assert(fixtureSubagent.entries.some((e) => e.role === 'user' && e.content.some((b) => b.type === 'tool_result')), 'fixture subagent transcript includes tool result')

  console.log('\n== Claude Cowork local-agent-mode-sessions ==')
  const coworkFiles = await walk(PATHS.claudeCoworkSessions, (n) => n === 'audit.jsonl')
  console.log(`  audit files: ${coworkFiles.length}`)
  let cowork = []
  for (const f of coworkFiles) cowork.push(...(await parseCowork(f)))
  console.log(`  usage records: ${cowork.length}`)
  const knownCowork = cowork.find((r) => r.sessionId === 'local_0710171f-18a1-4cbb-a19d-11090d0c958a')
  if (knownCowork) {
    assert(knownCowork.model === 'claude-fable-5', 'known MCP tools summary session model is claude-fable-5')
    assert(Math.abs((knownCowork.actualCostUsd ?? 0) - 0.358861) < 0.000001, 'known MCP tools summary session exact cost is $0.358861')
  } else {
    console.log('  (known MCP tools summary session not present on this machine)')
  }
  const knownSubagentSession = coworkFiles.find((f) => f.includes('local_d56999f0-0ebc-49dc-b647-a7fc40939f07/audit.jsonl'))
  if (knownSubagentSession) {
    const subagents = await parseCoworkSubagents(knownSubagentSession, 'local_d56999f0-0ebc-49dc-b647-a7fc40939f07')
    assert(subagents.length === 543, 'known Cowork session discovers 543 matching subagent transcripts')
    const american = subagents.find((s) => s.taskId === 'a297461973be14312')
    assert(Boolean(american), 'known Cowork session includes agent-a297461973be14312')
    if (american) {
      assert(american.description === 'Renewal analysis: American Airlines', 'known Cowork subagent keeps American Airlines task description')
      assert(Boolean(american.file?.endsWith('/subagents/agent-a297461973be14312.jsonl')), 'known Cowork subagent links to matching transcript file')
      assert(american.entries.some((e) => e.role === 'assistant'), 'known Cowork subagent transcript has assistant entries')
    }
  } else {
    console.log('  (known Cowork subagent-heavy session not present on this machine)')
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

  console.log('\n== Codex drill-down formatting fixture ==')
  const knownCodexSession = '019f38ce-6f93-7502-93d0-0a752ab87263'
  const knownCodexFile = codexFiles.find((f) => f.includes(knownCodexSession))
  if (knownCodexFile) {
    const entries = await parseCodexEntries(knownCodexFile)
    const readable = entries.filter((e) =>
      ['codex-user-message', 'codex-assistant-message', 'codex-tool-call', 'codex-tool-result'].includes(e.subtype)
    )
    assert(entries.some((e) => e.subtype === 'codex-developer-context' && e.role === 'system'), 'Codex developer context is system metadata')
    assert(!entries.some((e) => e.role === 'user' && e.content.some((b) => b.text?.startsWith('<permissions instructions>'))), 'Codex developer context is not emitted as User')
    assert(entries.some((e) => e.subtype === 'codex-user-message' && e.role === 'user'), 'Codex event_msg.user_message is the visible user turn')
    assert(readable[0]?.subtype === 'codex-user-message', 'Codex readable timeline starts with real user message')
    assert(entries.some((e) => e.subtype === 'codex-assistant-message' && e.role === 'assistant'), 'Codex assistant messages are preserved')
    assert(entries.some((e) => e.subtype === 'codex-tool-call' && e.content.some((b) => b.type === 'tool_use' && b.name === 'exec_command')), 'Codex exec_command tool calls are preserved')
    assert(entries.some((e) => e.subtype === 'codex-tool-result' && e.content.some((b) => b.type === 'tool_result')), 'Codex tool results are preserved')
    assert(entries.some((e) => e.subtype === 'codex-reasoning' && e.role === 'event'), 'Codex encrypted reasoning is represented as metadata event')
    assert(!entries.some((e) => e.role === 'assistant' && e.content.some((b) => b.type === 'thinking' && String(b.thinking).includes('encrypted'))), 'Codex encrypted reasoning is not shown as fake assistant thinking')
    assert(entries.some((e) => e.subtype === 'codex-token-count' && e.role === 'event'), 'Codex token-count events remain available in full trace')
  } else {
    console.log('  (known Codex session not present on this machine)')
  }

  console.log('\n== Codex subagent traceability fixture ==')
  const codexFixtureRoot = join(here, 'fixtures', 'codex')
  const codexFixtureSubagents = await parseCodexSubagents(codexFixtureRoot, 'codex-parent-fixture')
  assert(codexFixtureSubagents.length === 2, 'fixture discovers two user-spawned Codex subagents')
  assert(codexFixtureSubagents.every((s) => s.models.includes('gpt-5.4-mini')), 'fixture subagent models are parsed from turn_context')
  assert(codexFixtureSubagents.some((s) => s.description === 'Alpha'), 'fixture keeps Alpha nickname')
  assert(codexFixtureSubagents.some((s) => s.description === 'Beta'), 'fixture keeps Beta nickname')
  assert(codexFixtureSubagents.every((s) => s.status === 'completed'), 'fixture subagent completion status is parsed')
  assert(codexFixtureSubagents.some((s) => s.entries.some((e) => e.subtype === 'codex-tool-call')), 'fixture subagent tool calls are preserved')
  assert(codexFixtureSubagents.some((s) => s.entries.some((e) => e.subtype === 'codex-tool-result')), 'fixture subagent tool results are preserved')
  assert(!codexFixtureSubagents.some((s) => s.agentId === 'codex-guardian-fixture'), 'fixture guardian subagent is not attached to parent drill-down')
  const fixtureParentRecords = await parseCodex(join(codexFixtureRoot, 'parent.jsonl'))
  const fixtureChildRecords = [
    ...(await parseCodex(join(codexFixtureRoot, 'child-a.jsonl'))),
    ...(await parseCodex(join(codexFixtureRoot, 'child-b.jsonl')))
  ]
  assert(fixtureParentRecords[0]?.subSource === 'codex-cli', 'fixture parent remains codex-cli usage')
  assert(fixtureChildRecords.every((r) => r.subSource === 'codex-subagent'), 'fixture children are codex-subagent usage records')
  assert(fixtureChildRecords.every((r) => r.parentSessionId === 'codex-parent-fixture'), 'fixture child usage records link to parent session')

  console.log('\n== Codex local subagent example ==')
  const knownCodexSubagentParent = '019f3a8d-bdd2-7601-9890-89fabffbd070'
  const knownCodexSubagents = await parseCodexSubagents(PATHS.codexSessions, knownCodexSubagentParent)
  if (knownCodexSubagents.length) {
    assert(knownCodexSubagents.length === 5, 'known Codex session discovers five user-spawned subagents')
    for (const name of ['Erdos', 'Kant', 'Pasteur', 'Cicero', 'Bernoulli']) {
      assert(knownCodexSubagents.some((s) => s.description === name), `known Codex subagent includes ${name}`)
    }
    assert(knownCodexSubagents.every((s) => s.models.includes('gpt-5.4-mini')), 'known Codex subagents use gpt-5.4-mini')
    assert(knownCodexSubagents.every((s) => s.entries.length > 0), 'known Codex subagent transcripts are non-empty')
    const relatedFiles = codexFiles.filter((f) => f.includes(knownCodexSubagentParent) || knownCodexSubagents.some((s) => f.includes(s.agentId)))
    let relatedRecords = []
    for (const file of relatedFiles) relatedRecords.push(...(await parseCodex(file)))
    const parentRecords = relatedRecords.filter((r) => r.sessionId === knownCodexSubagentParent)
    const childRecords = relatedRecords.filter((r) => r.parentSessionId === knownCodexSubagentParent)
    assert(parentRecords.length === 1, 'known Codex parent remains one usage record')
    assert(childRecords.length === 5, 'known Codex children remain five usage records')
    assert(childRecords.every((r) => r.subSource === 'codex-subagent'), 'known Codex child usage records are marked codex-subagent')
  } else {
    console.log('  (known Codex subagent example not present on this machine)')
  }

  console.log('\n== Claude 3p Desktop drill-down fixture ==')
  const known3pSession = 'b6de28c9-3d11-49fd-a965-3bce48fa3196'
  const known3pFile = claudeFiles.find((f) => f.endsWith(`/${known3pSession}.jsonl`))
  if (known3pFile) {
    assert(isAllowedSessionFile(known3pFile, 'claude-3p'), 'claude-3p may read desktop transcript from ~/.claude/projects')
    const entries = await parseSessionEntries(known3pFile, known3pSession)
    assert(entries.some((e) => e.role === 'user'), 'known Claude 3p session has user entries')
    assert(entries.some((e) => e.role === 'assistant'), 'known Claude 3p session has assistant entries')
    const firstAssistant = entries.find((e) => e.role === 'assistant' && e.requestId === 'msg_bdrk_01LZ32CvjAsPcLq82g5nUcsN')
    assert(Boolean(firstAssistant), 'known Claude 3p assistant turn resolves by message id')
    if (firstAssistant) {
      const blockTypes = new Set(firstAssistant.content.map((b) => b.type))
      assert(blockTypes.has('thinking'), 'known Claude 3p assistant turn includes thinking block')
      assert(blockTypes.has('text'), 'known Claude 3p assistant turn includes text block')
      assert(blockTypes.has('tool_use'), 'known Claude 3p assistant turn includes tool-use block')
    }
  } else {
    console.log('  (known Claude 3p desktop session not present on this machine)')
  }

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
  const all = [...claudeDedup, ...cowork, ...codex]
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
    if (typeof r.actualCostUsd === 'number') {
      totalCost += r.actualCostUsd
      continue
    }
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
