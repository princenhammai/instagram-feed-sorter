import type { Post } from './types'

/** Sort's own idle limit. Batch and snowball use GRID_IDLE_ROUNDS. */
export const SORT_IDLE_ROUNDS = 6
/** Quiet rounds with no new reels before a batch or snowball account moves on. */
export const GRID_IDLE_ROUNDS = 10
/** How long a round waits for the next grid response before it counts as quiet. */
export const PAGE_WAIT_MS = 2_500
/** Extra wait while a grid request is still in flight. */
export const INFLIGHT_GRACE_MS = 10_000
/** Batch and snowball stop a stuck account here and move on. */
export const ACCOUNT_CAPTURE_MS = 90_000
export const ACCOUNT_CAPTURE_PER_REEL_MS = 3_000
export const ACCOUNT_CAPTURE_MAX_MS = 5 * 60_000

export interface SortCapture {
  posts: Post[]
  timedOut: boolean
  pages: number
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

/** 90s, or 3s per target reel, and never more than 5 minutes. */
export function accountCaptureMs(limit: number): number {
  const perReel = Math.max(0, limit) * ACCOUNT_CAPTURE_PER_REEL_MS
  return Math.min(ACCOUNT_CAPTURE_MAX_MS, Math.max(ACCOUNT_CAPTURE_MS, perReel))
}

export function formatCaptureBudget(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds >= 120 && seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

/** True when the panel should repaint. Skips unchanged counts and paints at most once per interval. */
export function allowProgressPaint(state: ProgressGate, count: number, now: number, intervalMs = 800): boolean {
  if (state.at !== 0 && count === state.count) return false
  if (state.at !== 0 && now - state.at < intervalMs) return false
  state.count = count
  state.at = now
  return true
}

export function gridCaptureSnippet(count: number, timedOut: boolean, pages = 0, budgetMs = ACCOUNT_CAPTURE_MS): { status: number; snippet: string } {
  const pageNote = pages > 0 ? ` (${pages} ${pages === 1 ? 'page' : 'pages'})` : ''
  if (count > 0) {
    const stop = timedOut ? `, stopped at ${formatCaptureBudget(budgetMs)}` : ''
    return { status: 200, snippet: `${count} reels read from the page grid${pageNote}${stop}` }
  }
  return {
    status: 0,
    snippet: timedOut
      ? `Timed out after ${formatCaptureBudget(budgetMs)}. No reels were captured.`
      : 'No reels were captured from this profile.',
  }
}

/**
 * Read captured posts, nudge the grid, and wait.
 * A shorter read never replaces reels already captured, and it does not reset the idle clock.
 * The first read always runs. deadlineAt is checked after that read.
 * When roundWaitMs is set, each round waits that long for a larger read and keeps waiting while inFlight is positive.
 */
export async function runSortCapture(options: {
  read: () => Promise<Post[]>
  nudge: (idle: number) => void
  sleep: (ms: number, signal: AbortSignal) => Promise<boolean>
  limit: number
  signal: AbortSignal
  deadlineAt?: number
  idleRounds?: number
  roundWaitMs?: number
  inFlight?: () => Promise<number>
  onProgress?: (count: number) => void
  now?: () => number
}): Promise<SortCapture> {
  const {
    read,
    nudge,
    sleep,
    limit,
    signal,
    deadlineAt,
    onProgress,
    inFlight,
    idleRounds = SORT_IDLE_ROUNDS,
    roundWaitMs,
    now = Date.now,
  } = options
  let best: Post[] = []
  let lastCount = -1
  let idle = 0
  let pages = 0
  let timedOut = false
  if (!(await sleep(700, signal))) return { posts: [], timedOut: false, pages: 0 }
  for (;;) {
    if (signal.aborted) break
    let batch: Post[] = []
    try {
      batch = await read()
    } catch {
      break
    }
    const grew = batch.length > lastCount
    if (batch.length > best.length) {
      best = batch
      pages += 1
    }
    onProgress?.(Math.min(best.length, limit))
    if (best.length >= limit) break
    idle = grew ? 0 : idle + 1
    lastCount = Math.max(lastCount, batch.length)
    if (idle >= idleRounds) break
    if (deadlineAt != null && now() >= deadlineAt) {
      timedOut = true
      break
    }
    nudge(idle)
    if (roundWaitMs == null) {
      if (!(await sleep(idle === 0 ? 700 : 1000, signal))) break
      continue
    }
    const outcome = await waitForGrowth({
      read,
      sleep,
      signal,
      before: best.length,
      roundWaitMs,
      inFlight,
      deadlineAt,
      now,
    })
    if (outcome === 'abort') break
    if (outcome === 'timeout') {
      timedOut = true
      break
    }
  }
  return {
    posts: [...best].sort((a, b) => b.takenAt - a.takenAt).slice(0, limit),
    timedOut,
    pages,
  }
}

async function waitForGrowth(options: {
  read: () => Promise<Post[]>
  sleep: (ms: number, signal: AbortSignal) => Promise<boolean>
  signal: AbortSignal
  before: number
  roundWaitMs: number
  inFlight?: () => Promise<number>
  deadlineAt?: number
  now: () => number
}): Promise<'ready' | 'timeout' | 'abort'> {
  const { read, sleep, signal, before, roundWaitMs, inFlight, deadlineAt, now } = options
  let waited = 0
  while (!signal.aborted) {
    if (deadlineAt != null && now() >= deadlineAt) return 'timeout'
    let inflight = 0
    if (inFlight) {
      try {
        inflight = await inFlight()
      } catch {
        inflight = 0
      }
    }
    try {
      const batch = await read()
      if (batch.length > before) return 'ready'
    } catch {
      return 'abort'
    }
    if (waited >= roundWaitMs && inflight <= 0) return 'ready'
    if (waited >= roundWaitMs + INFLIGHT_GRACE_MS) return 'ready'
    if (!(await sleep(200, signal))) return 'abort'
    waited += 200
  }
  return 'abort'
}
