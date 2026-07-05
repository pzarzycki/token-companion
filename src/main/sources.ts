import { homedir } from 'node:os'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'

/** Resolve absolute source paths on this machine. */
export function sourcePaths() {
  const home = homedir()
  const appSupport = join(home, 'Library', 'Application Support')
  return {
    /** Shared by Claude CLI + Claude Desktop agent modes + VS Code, told apart by `entrypoint`. */
    claudeProjects: join(home, '.claude', 'projects'),
    /** Claude 3p title-generation JSONL logs. */
    claude3pTitleGen: join(appSupport, 'Claude-3p', 'title-gen'),
    /** Codex CLI rollout sessions, organized as YYYY/MM/DD. */
    codexSessions: join(home, '.codex', 'sessions'),
    /** Desktop LevelDB/IndexedDB stores (discovery only — no token data). */
    desktopStores: [
      {
        app: 'Claude Desktop (1p)',
        path: join(appSupport, 'Claude', 'IndexedDB')
      },
      {
        app: 'Claude Desktop (3p)',
        path: join(appSupport, 'Claude-3p', 'IndexedDB')
      },
      {
        app: 'Codex Desktop',
        path: join(appSupport, 'Codex', 'Default', 'Local Storage', 'leveldb')
      }
    ]
  }
}

/** Recursively collect files matching a predicate. Returns [] if the root is missing. */
export async function walkFiles(
  root: string,
  match: (name: string) => boolean
): Promise<string[]> {
  const out: string[] = []
  async function recurse(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return // missing/unreadable dir — skip silently
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await recurse(full)
      } else if (entry.isFile() && match(entry.name)) {
        out.push(full)
      }
    }
  }
  await recurse(root)
  return out
}

export const isJsonl = (name: string): boolean => name.endsWith('.jsonl')
