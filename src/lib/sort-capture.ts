import type { Post } from './types'

/** Same idle limit as v0.3.2 captureSort. */
export const SORT_IDLE_ROUNDS = 6
/** Batch and snowball stop a stuck account here and move on. */
export const ACCOUNT_CAPTURE_MS = 90_000

export interface SortCapture {
  posts: Post[]
  timedOut: boolean
}

export interface ProgressGate {
  count: number
  at: number
}

export function postsForSurface(posts: Post[], username: string, kind: 'reels' | 'posts'): Post[] {
  const want = username.trim().toLowerCase()
  return posts.filter((post) => {
    if (post.username.toLowerCase() !== want) return false
    return kind === 'posts' || post.mediaKind === 'video'
  })
}

/** True when the panel should repaint. Skips unchanged counts and paints at most once per interval. */
export function allowProgressPaint(state: ProgressGate, count: number, now: number, intervalMs = 800): boolean {
  if (state.at !== 0 && count === state.count) return false
  if (state.at !== 0 && now - state.at < intervalMs) return false
  state.count = count
  state.at = now
  return true
}

export function gridCaptureSnippet(count: number, timedOut: boolean): { status: number; snippet: string } {
  if (count > 0) {
    return {
      status: 200,
      snippet: `${count} reels read from the page grid${timedOut ? ' (stopped at 90s)' : ''}`,
    }
  }
  return {
    status: 0,
    snippet: timedOut ? 'Timed out after 90s. No reels were captured.' : 'No reels were captured from this profile.',
  }
}

/**
 * v0.3.2 Sort loop: read captured posts, scroll the window, wait 700ms after a
 * new page and 1000ms when nothing new arrived, stop after 6 idle rounds or the limit.
 * A shorter read never replaces reels already captured, and it does not reset the idle
 * clock — a flicker between 0 and the first page cannot spin until Stop.
 * The first read always runs, so the response already on the page is kept.
 * deadlineAt is the batch guard and is checked after that read.
 */
export async function runSortCapture(options: {
  read: () => Promise<Post[]>
  nudge: (idle: number) => void
  sleep: (ms: number, signal: AbortSignal) => Promise<boolean>
  limit: number
  signal: AbortSignal
  deadlineAt?: number
  onProgress?: (count: number) => void
}): Promise<SortCapture> {
  const { read, nudge, sleep, limit, signal, deadlineAt, onProgress } = options
  let best: Post[] = []
  let lastCount = -1
  let idle = 0
  let timedOut = false
  if (!(await sleep(700, signal))) return { posts: [], timedOut: false }
  for (;;) {
    if (signal.aborted) break
    let batch: Post[] = []
    try {
      batch = await read()
    } catch {
      break
    }
    const grew = batch.length > lastCount
    if (batch.length > best.length) best = batch
    onProgress?.(Math.min(best.length, limit))
    if (best.length >= limit) break
    idle = grew ? 0 : idle + 1
    lastCount = Math.max(lastCount, batch.length)
    if (idle >= SORT_IDLE_ROUNDS) break
    if (deadlineAt != null && Date.now() >= deadlineAt) {
      timedOut = true
      break
    }
    nudge(idle)
    if (!(await sleep(idle === 0 ? 700 : 1000, signal))) break
  }
  return {
    posts: [...best].sort((a, b) => b.takenAt - a.takenAt).slice(0, limit),
    timedOut,
  }
}
