import { callMain } from './bridge'
import {
  accountCaptureMs,
  GRID_IDLE_ROUNDS,
  PAGE_WAIT_MS,
  postsForSurface,
  runSortCapture,
  type SortCapture,
} from '../lib/sort-capture'
import type { Post } from '../lib/types'

function pause(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    const timer = window.setTimeout(() => resolve(true), ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve(false)
      },
      { once: true },
    )
  })
}

/** The v0.3.2 Sort nudge: the window only. */
export function nudgeSortGrid(idle: number): void {
  const page = document.scrollingElement || document.documentElement
  if (idle > 0 && idle % 2 === 0) window.scrollBy(0, -900)
  window.scrollTo(0, page.scrollHeight)
}

export function lastGridTile(username: string): HTMLAnchorElement | null {
  const want = username.trim().toLowerCase()
  let last: HTMLAnchorElement | null = null
  const root = document.querySelector('main') || document.body
  for (const node of root.querySelectorAll('a[href]')) {
    if (!(node instanceof HTMLAnchorElement)) continue
    if (node.closest('nav, header, aside, [role="navigation"]')) continue
    let path = ''
    try {
      path = new URL(node.href, location.href).pathname.toLowerCase()
    } catch {
      continue
    }
    if (!path.includes('/reel/') && !path.includes('/p/')) continue
    if (!want || path.startsWith(`/${want}/`) || path.startsWith('/reel/') || path.startsWith('/p/')) last = node
  }
  return last
}

/** Bring the last reel tile into view, then the window bottom, so the grid asks for the next page. */
export function nudgeProfileGrid(username: string, idle: number): void {
  const page = document.scrollingElement || document.documentElement
  if (idle > 0 && idle % 2 === 0) window.scrollBy(0, -900)
  const tile = lastGridTile(username)
  try {
    tile?.scrollIntoView({ block: 'end', inline: 'nearest' })
  } catch {
    // A detached tile should not stop the window scroll.
  }
  window.scrollTo(0, page.scrollHeight)
}

async function readCaptured(username: string): Promise<Post[]> {
  const raw = await callMain({ action: 'captured' })
  const all = Array.isArray(raw) ? (raw as Post[]) : []
  return postsForSurface(all, username, 'reels')
}

async function readPulse(): Promise<{ inflight: number; pages: number }> {
  try {
    const raw = await callMain({ action: 'capture-pulse' })
    if (!raw || typeof raw !== 'object') return { inflight: 0, pages: 0 }
    const pulse = raw as { inflight?: unknown; pages?: unknown }
    const inflight = typeof pulse.inflight === 'number' && Number.isFinite(pulse.inflight) ? pulse.inflight : 0
    const pages = typeof pulse.pages === 'number' && Number.isFinite(pulse.pages) ? pulse.pages : 0
    return { inflight, pages }
  } catch {
    return { inflight: 0, pages: 0 }
  }
}

export async function collectGridReels(
  username: string,
  limit: number,
  signal: AbortSignal,
  onProgress?: (count: number) => void,
): Promise<SortCapture> {
  const started = await readPulse()
  const result = await runSortCapture({
    read: () => readCaptured(username),
    nudge: (idle) => nudgeProfileGrid(username, idle),
    sleep: pause,
    limit,
    signal,
    deadlineAt: Date.now() + accountCaptureMs(limit),
    idleRounds: GRID_IDLE_ROUNDS,
    roundWaitMs: PAGE_WAIT_MS,
    inFlight: async () => (await readPulse()).inflight,
    onProgress,
  })
  const ended = await readPulse()
  window.scrollTo(0, 0)
  return { ...result, pages: Math.max(result.pages, ended.pages - started.pages) }
}
