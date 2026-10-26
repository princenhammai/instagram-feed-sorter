import { callMain } from './bridge'
import { ACCOUNT_CAPTURE_MS, postsForSurface, runSortCapture, type SortCapture } from '../lib/sort-capture'
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

/** The v0.3.2 Sort nudge: the window only, never an inner scroller or a synthetic wheel. */
export function nudgeSortGrid(idle: number): void {
  const page = document.scrollingElement || document.documentElement
  if (idle > 0 && idle % 2 === 0) window.scrollBy(0, -900)
  window.scrollTo(0, page.scrollHeight)
}

async function readCaptured(username: string): Promise<Post[]> {
  const raw = await callMain({ action: 'captured' })
  const all = Array.isArray(raw) ? (raw as Post[]) : []
  return postsForSurface(all, username, 'reels')
}

export async function collectGridReels(
  username: string,
  limit: number,
  signal: AbortSignal,
  onProgress?: (count: number) => void,
): Promise<SortCapture> {
  const result = await runSortCapture({
    read: () => readCaptured(username),
    nudge: nudgeSortGrid,
    sleep: pause,
    limit,
    signal,
    deadlineAt: Date.now() + ACCOUNT_CAPTURE_MS,
    onProgress,
  })
  window.scrollTo(0, 0)
  return result
}
