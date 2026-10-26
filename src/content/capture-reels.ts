import { callMain } from './bridge'
import type { Post } from '../lib/types'

const IDLE_ROUNDS = 6

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

function nudge(idle: number): void {
  const page = document.scrollingElement || document.documentElement
  if (idle > 0 && idle % 2 === 0) window.scrollBy(0, -900)
  window.scrollTo(0, page.scrollHeight)
}

export async function collectGridReels(
  username: string,
  limit: number,
  signal: AbortSignal,
  onProgress?: (count: number) => void,
): Promise<Post[]> {
  const want = username.toLowerCase()
  let last = -1
  let idle = 0
  let posts: Post[] = []
  if (!(await pause(700, signal))) return []
  for (;;) {
    if (signal.aborted) break
    const raw = await callMain({ action: 'captured' })
    const all = Array.isArray(raw) ? (raw as Post[]) : []
    posts = all.filter((post) => post.username.toLowerCase() === want && post.mediaKind === 'video')
    onProgress?.(Math.min(posts.length, limit))
    if (posts.length >= limit) break
    idle = posts.length === last ? idle + 1 : 0
    last = posts.length
    if (idle >= IDLE_ROUNDS) break
    nudge(idle)
    if (!(await pause(idle === 0 ? 700 : 1000, signal))) break
  }
  window.scrollTo(0, 0)
  return [...posts].sort((a, b) => b.takenAt - a.takenAt).slice(0, limit)
}
