import { callMain } from './bridge'
import { nudgeFeed } from './capture-reels'
import { GRID_IDLE_ROUNDS, nextIdle } from '../lib/grid-reels'
import { accountsFromHrefs, mergeSearchAccounts, usernameFromPath, type PageAccount } from '../lib/page-accounts'

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

function resultAnchors(): HTMLAnchorElement[] {
  const root = document.querySelector('main') || document.body
  const found: HTMLAnchorElement[] = []
  for (const node of root.querySelectorAll('a[href]')) {
    if (!(node instanceof HTMLAnchorElement) || node.closest('nav, header')) continue
    let pathname = ''
    try {
      pathname = new URL(node.href, location.href).pathname
    } catch {
      continue
    }
    if (!usernameFromPath(pathname)) continue
    found.push(node)
  }
  return found
}

function domUsernames(): string[] {
  return accountsFromHrefs(resultAnchors().map((anchor) => anchor.href))
}

async function capturedAccounts(): Promise<PageAccount[]> {
  const raw = await callMain({ action: 'captured-accounts' })
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const account = item as { username?: unknown; followers?: unknown }
    if (typeof account.username !== 'string') return []
    const followers = typeof account.followers === 'number' && Number.isFinite(account.followers) ? account.followers : null
    return [{ username: account.username, followers }]
  })
}

export async function collectSearchAccounts(
  cap: number,
  signal: AbortSignal,
  onProgress?: (count: number) => void,
): Promise<PageAccount[]> {
  if (!(await pause(800, signal))) return []
  let hits = mergeSearchAccounts(await capturedAccounts(), domUsernames(), cap)
  onProgress?.(hits.length)
  let idle = 0
  let last = hits.length
  const deadline = Date.now() + 8000
  while (hits.length === 0 && Date.now() < deadline && !signal.aborted) {
    if (!(await pause(300, signal))) return hits
    hits = mergeSearchAccounts(await capturedAccounts(), domUsernames(), cap)
    onProgress?.(hits.length)
  }
  while (hits.length < cap && idle < GRID_IDLE_ROUNDS && !signal.aborted) {
    nudgeFeed(idle, resultAnchors())
    const grownAt = Date.now() + 2800
    let grew = false
    while (Date.now() < grownAt && !signal.aborted) {
      if (!(await pause(400, signal))) break
      hits = mergeSearchAccounts(await capturedAccounts(), domUsernames(), cap)
      onProgress?.(hits.length)
      if (hits.length > last) {
        grew = true
        break
      }
    }
    if (hits.length >= cap || signal.aborted) break
    idle = grew ? 0 : nextIdle(last, hits.length, idle)
    last = hits.length
  }
  window.scrollTo(0, 0)
  return hits
}
