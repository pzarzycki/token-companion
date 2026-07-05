import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ClassicLevel } from 'classic-level'
import type { DesktopGapEntry } from '@shared/types'

/**
 * Best-effort DISCOVERY of desktop conversation stores. These LevelDB /
 * IndexedDB stores hold plain-chat conversations but carry NO token-count
 * fields (verified on-machine), so we cannot cost them in v1. The goal here is
 * only to make the gap visible: "there are N conversations here we can't count
 * yet." Full extraction / local-tokenizer estimation is a documented TODO.
 *
 * Strategy per store:
 *   1. Find the actual *.leveldb dir(s) under the given root.
 *   2. Try to open read-only with classic-level and count conversation-like keys.
 *   3. If locked (app running) or unreadable, fall back to scanning the raw
 *      .ldb/.log bytes for a conversation marker and report an estimate.
 */

/** Key/value substrings that suggest a distinct conversation record. */
const CONVERSATION_MARKERS = [
  'conversation',
  'chat_',
  'sessionId',
  'session_id',
  'messages'
]

async function findLevelDbDirs(root: string): Promise<string[]> {
  const dirs: string[] = []
  async function recurse(dir: string, depth: number): Promise<void> {
    if (depth > 4) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    // A leveldb dir contains a CURRENT file + *.ldb/*.log.
    const hasCurrent = entries.some((e) => e.isFile() && e.name === 'CURRENT')
    if (hasCurrent) {
      dirs.push(dir)
      return // don't descend into a leveldb dir
    }
    for (const entry of entries) {
      if (entry.isDirectory()) await recurse(join(dir, entry.name), depth + 1)
    }
  }
  await recurse(root, 0)
  return dirs
}

async function countByOpen(dir: string): Promise<number | null> {
  const db = new ClassicLevel<string, string>(dir, {
    createIfMissing: false,
    valueEncoding: 'utf8',
    keyEncoding: 'utf8'
  })
  try {
    await db.open({ passive: false })
  } catch {
    return null // locked or incompatible — caller falls back to byte scan
  }
  try {
    let count = 0
    for await (const [key] of db.iterator()) {
      const k = key.toLowerCase()
      if (CONVERSATION_MARKERS.some((m) => k.includes(m.toLowerCase()))) count++
    }
    return count
  } catch {
    return null
  } finally {
    await db.close().catch(() => undefined)
  }
}

async function estimateByBytes(dir: string): Promise<number> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  let hits = 0
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.(ldb|log)$/.test(entry.name)) continue
    let buf: Buffer
    try {
      buf = await fs.readFile(join(dir, entry.name))
    } catch {
      continue
    }
    const text = buf.toString('latin1')
    // Count occurrences of the strongest marker to approximate conversation count.
    const marker = 'conversation'
    let idx = text.indexOf(marker)
    while (idx !== -1) {
      hits++
      idx = text.indexOf(marker, idx + marker.length)
    }
  }
  return hits
}

export async function probeDesktopStore(
  app: string,
  root: string
): Promise<DesktopGapEntry[]> {
  const dirs = await findLevelDbDirs(root)
  if (dirs.length === 0) {
    return [] // store not present on this machine
  }
  const results: DesktopGapEntry[] = []
  for (const dir of dirs) {
    const opened = await countByOpen(dir)
    if (opened !== null) {
      results.push({
        app,
        path: dir,
        conversationCount: opened,
        note: 'Binary store — conversations found, but no token counts are recorded here (v1 cannot cost these).'
      })
    } else {
      const estimate = await estimateByBytes(dir)
      results.push({
        app,
        path: dir,
        conversationCount: estimate,
        note: 'Store locked (app running?) or unreadable — count is a rough byte-scan estimate. No token counts available.'
      })
    }
  }
  return results
}
