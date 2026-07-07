import { basename, dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { ConversationEntry, CoworkSubagentTrace, SessionEntries } from '@shared/types'
import { num, readJsonlObjects, str } from './jsonlReader'
import { parseClaudeTranscriptEntries } from './sessionEntries'

interface CoworkMetadata {
  cliSessionId?: string
}

interface TaskInfo {
  taskId: string
  toolUseId?: string
  description?: string
  subagentType?: string
  taskType?: string
  prompt?: string
  firstTimestamp: string
  lastTimestamp: string
  status?: string
  progressCount: number
  stepCount: number
}

interface TokenAccumulator {
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
}

async function readMetadata(auditPath: string): Promise<CoworkMetadata> {
  const sessionDir = dirname(auditPath)
  const metadataPath = join(dirname(sessionDir), `${basename(sessionDir)}.json`)
  try {
    const raw = await fs.readFile(metadataPath, 'utf8')
    const obj = JSON.parse(raw) as Record<string, unknown>
    return {
      cliSessionId: str(obj.cliSessionId)
    }
  } catch {
    return {}
  }
}

function previewText(text: string | undefined): string | undefined {
  if (!text) return undefined
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized
}

function updateTime(task: TaskInfo, timestamp: string | undefined): void {
  if (!timestamp) return
  if (!task.firstTimestamp || timestamp < task.firstTimestamp) task.firstTimestamp = timestamp
  if (!task.lastTimestamp || timestamp > task.lastTimestamp) task.lastTimestamp = timestamp
}

function taskFor(tasks: Map<string, TaskInfo>, taskId: string): TaskInfo {
  let task = tasks.get(taskId)
  if (!task) {
    task = {
      taskId,
      firstTimestamp: '',
      lastTimestamp: '',
      progressCount: 0,
      stepCount: 0
    }
    tasks.set(taskId, task)
  }
  return task
}

async function collectTasks(auditPath: string): Promise<Map<string, TaskInfo>> {
  const tasks = new Map<string, TaskInfo>()

  for await (const obj of readJsonlObjects(auditPath)) {
    const subtype = str(obj.subtype)
    if (!subtype?.startsWith('task_')) continue

    const taskId = str(obj.task_id)
    if (!taskId) continue

    const task = taskFor(tasks, taskId)
    const timestamp = str(obj.timestamp) ?? str(obj._audit_timestamp)
    updateTime(task, timestamp)

    if (subtype === 'task_started') {
      task.toolUseId = str(obj.tool_use_id) ?? task.toolUseId
      task.description = str(obj.description) ?? task.description
      task.subagentType = str(obj.subagent_type) ?? task.subagentType
      task.taskType = str(obj.task_type) ?? task.taskType
      task.prompt = str(obj.prompt) ?? task.prompt
      continue
    }

    if (subtype === 'task_progress') {
      task.progressCount += 1
      const usage = obj.usage as Record<string, unknown> | undefined
      const toolUses = num(usage?.tool_uses)
      if (toolUses > task.stepCount) task.stepCount = toolUses
      continue
    }

    if (subtype === 'task_updated' || subtype === 'task_notification') {
      task.status = str(obj.status) ?? str(obj.description) ?? task.status
    }
  }

  return tasks
}

async function findSubagentFiles(sessionDir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  const projectsDir = join(sessionDir, '.claude', 'projects')

  async function recurse(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isFile()) {
        const match = entry.name.match(/^agent-(.+)\.jsonl$/)
        if (match) files.set(match[1], full)
        continue
      }
      if (entry.isDirectory()) {
        await recurse(full)
      }
    }
  }

  await recurse(projectsDir)
  return files
}

function addUsage(totals: TokenAccumulator, usage: Record<string, unknown>): void {
  totals.inputTokens += num(usage.input_tokens)
  totals.outputTokens += num(usage.output_tokens)
  totals.cacheWriteTokens += num(usage.cache_creation_input_tokens)
  totals.cacheReadTokens += num(usage.cache_read_input_tokens)
}

async function summarizeSubagentFile(filePath: string): Promise<{
  firstTimestamp: string
  lastTimestamp: string
  models: string[]
  tokens: TokenAccumulator
}> {
  const models = new Set<string>()
  const tokens: TokenAccumulator = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0
  }
  let firstTimestamp = ''
  let lastTimestamp = ''

  for await (const obj of readJsonlObjects(filePath)) {
    const timestamp = str(obj.timestamp)
    if (timestamp) {
      if (!firstTimestamp || timestamp < firstTimestamp) firstTimestamp = timestamp
      if (!lastTimestamp || timestamp > lastTimestamp) lastTimestamp = timestamp
    }

    if (obj.type !== 'assistant') continue
    const message = obj.message as Record<string, unknown> | undefined
    if (!message || typeof message !== 'object') continue

    const model = str(message.model)
    if (model) models.add(model)

    const usage = message.usage as Record<string, unknown> | undefined
    if (usage && typeof usage === 'object') addUsage(tokens, usage)
  }

  return { firstTimestamp, lastTimestamp, models: [...models], tokens }
}

export async function parseClaudeCoworkSessionEntries(
  filePath: string,
  sessionId: string
): Promise<SessionEntries> {
  const sessionDir = dirname(filePath)
  const metadata = await readMetadata(filePath)
  const cliSessionId = metadata.cliSessionId ?? sessionId
  const entries = await parseClaudeTranscriptEntries(filePath, cliSessionId)
  const tasks = await collectTasks(filePath)
  const subagentFiles = await findSubagentFiles(sessionDir)
  const subagents: CoworkSubagentTrace[] = []

  for (const task of tasks.values()) {
    const subagentFile = subagentFiles.get(task.taskId)
    let agentEntries: ConversationEntry[] = []
    let models: string[] = []
    let firstTimestamp = task.firstTimestamp
    let lastTimestamp = task.lastTimestamp
    let tokens: TokenAccumulator = {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0
    }

    if (subagentFile) {
      agentEntries = await parseClaudeTranscriptEntries(subagentFile, cliSessionId)
      const summary = await summarizeSubagentFile(subagentFile)
      models = summary.models
      tokens = summary.tokens
      firstTimestamp = summary.firstTimestamp || firstTimestamp
      lastTimestamp = summary.lastTimestamp || lastTimestamp
    }

    subagents.push({
      agentId: task.taskId,
      taskId: task.taskId,
      toolUseId: task.toolUseId,
      description: task.description,
      subagentType: task.subagentType,
      taskType: task.taskType,
      promptPreview: previewText(task.prompt),
      firstTimestamp,
      lastTimestamp,
      status: task.status,
      progressCount: task.progressCount,
      stepCount: task.stepCount,
      models,
      ...tokens,
      entries: agentEntries
    })
  }

  subagents.sort((a, b) => a.firstTimestamp.localeCompare(b.firstTimestamp))
  return { sessionId, entries, subagents }
}
