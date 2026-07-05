import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

/**
 * Stream a JSONL file line by line, yielding parsed objects.
 * Malformed lines are skipped (callers get only valid JSON objects).
 */
export async function* readJsonlObjects(
  filePath: string
): AsyncGenerator<Record<string, unknown>> {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let obj: unknown
      try {
        obj = JSON.parse(trimmed)
      } catch {
        continue // skip malformed line
      }
      if (obj && typeof obj === 'object') {
        yield obj as Record<string, unknown>
      }
    }
  } finally {
    rl.close()
    stream.close()
  }
}

/** Safe nested numeric read. */
export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Safe string read. */
export function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
