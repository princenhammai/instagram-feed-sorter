import { callMain } from './bridge'
import { GRID_IDLE_ROUNDS, nextIdle, reelsForAccount } from '../lib/grid-reels'
import type { Post } from '../lib/types'

const WAIT_FOR_GROWTH_MS = 2800
const GRID_READY_MS = 8000

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

function canScroll(node: HTMLElement): boolean {
  const style = getComputedStyle(node)
  const overflow = `${style.overflowY} ${style.overflow}`
  return /(auto|scroll|overlay)/.test(overflow) && node.scrollHeight > node.clientHeight + 40
}

function scrollableAncestor(start: Element | null): HTMLElement {
  const page = (document.scrollingElement as HTMLElement | null) || document.documentElement
  let node = start?.parentElement ?? null
  let fallback: HTMLElement | null = null
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight + 80) {
      if (canScroll(node)) return node
      fallback = fallback ?? node
    }
    node = node.parentElement
  }
  return fallback ?? page
}

export function profileAnchors(username: string): HTMLAnchorElement[] {
  const want = username.trim().toLowerCase()
  const found: HTMLAnchorElement[] = []
  for (const node of document.querySelectorAll('a[href]')) {
    if (!(node instanceof HTMLAnchorElement) || node.closest('nav, header')) continue
    let path = ''
    try {
      path = new URL(node.href, location.href).pathname.toLowerCase()
    } catch {
      continue
    }
    if (!path.includes('/reel/') && !path.includes('/p/')) continue
    if (path.startsWith(`/${want}/`) || path.startsWith('/reel/') || path.startsWith('/p/')) found.push(node)
  }
  return found
}

export function nudgeFeed(idle: number, anchors: HTMLElement[]): void {
  const page = (document.scrollingElement as HTMLElement | null) || document.documentElement
  const last = anchors[anchors.length - 1] ?? null
  const scroller = scrollableAncestor(last ?? document.querySelector('main'))
  if (idle > 0 && idle % 2 === 0) {
    if (scroller !== page) scroller.scrollTop = Math.max(0, scroller.scrollTop - 800)
    window.scrollBy(0, -900)
  }
  const step = Math.max(520, (scroller.clientHeight || window.innerHeight) * 0.9)
  if (scroller !== page) scroller.scrollTop = Math.min(scroller.scrollHeight, scroller.scrollTop + step)
  last?.scrollIntoView({ block: 'end', inline: 'nearest' })
  window.scrollTo(0, page.scrollHeight)
  scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
  window.dispatchEvent(new Event('scroll'))
  last?.dispatchEvent(new WheelEvent('wheel', { deltaY: 900, bubbles: true, cancelable: true }))
}

export function nudgeReelGrid(username: string, idle: number): void {
  nudgeFeed(idle, profileAnchors(username))
}

async function readCaptured(username: string): Promise<Post[]> {
  const raw = await callMain({ action: 'captured' })
  const all = Array.isArray(raw) ? (raw as Post[]) : []
  return reelsForAccount(all, username)
}

async function waitForGrid(username: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + GRID_READY_MS
  while (Date.now() < deadline && !signal.aborted) {
    if (profileAnchors(username).length >= 3) return
    const posts = await readCaptured(username)
    if (posts.length > 0 && profileAnchors(username).length > 0) return
    if (!(await pause(300, signal))) return
  }
}

async function waitForGrowth(previous: number, read: () => Promise<number>, signal: AbortSignal): Promise<number> {
  const deadline = Date.now() + WAIT_FOR_GROWTH_MS
  let count = previous
  while (Date.now() < deadline && !signal.aborted) {
    if (!(await pause(400, signal))) return count
    count = await read()
    if (count > previous) return count
  }
  return count
}

export async function collectGridReels(
  username: string,
  limit: number,
  signal: AbortSignal,
  onProgress?: (count: number) => void,
): Promise<Post[]> {
  if (!(await pause(700, signal))) return []
  await waitForGrid(username, signal)
  let posts = await readCaptured(username)
  onProgress?.(Math.min(posts.length, limit))
  let idle = 0
  let last = posts.length
  while (posts.length < limit && idle < GRID_IDLE_ROUNDS && !signal.aborted) {
    nudgeReelGrid(username, idle)
    const count = await waitForGrowth(last, async () => {
      posts = await readCaptured(username)
      onProgress?.(Math.min(posts.length, limit))
      return posts.length
    }, signal)
    if (signal.aborted) break
    if (posts.length >= limit) break
    idle = nextIdle(last, count, idle)
    last = posts.length
  }
  window.scrollTo(0, 0)
  return [...posts].sort((a, b) => b.takenAt - a.takenAt).slice(0, limit)
}
