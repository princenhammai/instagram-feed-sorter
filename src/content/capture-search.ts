import { callMain } from './bridge'
import { nudgeSortGrid } from './capture-reels'
import {
  accountsFromHrefs,
  accountsFromSearchHits,
  usernameFromPath,
  visibleSearchAccounts,
  type PageAccount,
} from '../lib/page-accounts'

const SEARCH_IDLE_ROUNDS = 3
const SEARCH_DEADLINE_MS = 15_000

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

function inChrome(node: Element): boolean {
  if (node.closest('nav, header, aside, [role="navigation"], [role="complementary"]')) return true
  let current: Element | null = node
  while (current && current !== document.body) {
    const label = (current.getAttribute('aria-label') || '').toLowerCase()
    if (/\bsuggest|\bfollowing\b/.test(label)) return true
    current = current.parentElement
  }
  return false
}

function classifyAnchors(): { resultHrefs: string[]; chromeHrefs: string[] } {
  const resultHrefs: string[] = []
  const chromeHrefs: string[] = []
  const root = document.querySelector('main') || document.body
  for (const node of document.querySelectorAll('a[href]')) {
    if (!(node instanceof HTMLAnchorElement)) continue
    let pathname = ''
    try {
      pathname = new URL(node.href, location.href).pathname
    } catch {
      continue
    }
    if (!usernameFromPath(pathname)) continue
    if (inChrome(node) || !root.contains(node)) chromeHrefs.push(node.href)
    else resultHrefs.push(node.href)
  }
  return { resultHrefs, chromeHrefs }
}

async function queryHits(): Promise<PageAccount[]> {
  const raw = await callMain({ action: 'search-hits' })
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
  if (!(await pause(700, signal))) return []
  let best: PageAccount[] = []
  let last = -1
  let idle = 0
  const deadline = Date.now() + SEARCH_DEADLINE_MS
  for (;;) {
    if (signal.aborted || Date.now() >= deadline) break
    const { resultHrefs, chromeHrefs } = classifyAnchors()
    const dom = visibleSearchAccounts(resultHrefs, chromeHrefs, cap)
    const hits = accountsFromSearchHits(dom, await queryHits(), accountsFromHrefs(chromeHrefs), cap)
    if (hits.length > best.length) best = hits
    onProgress?.(best.length)
    if (best.length >= cap) break
    const grew = hits.length > last
    idle = grew ? 0 : idle + 1
    last = Math.max(last, hits.length)
    if (idle >= SEARCH_IDLE_ROUNDS) break
    nudgeSortGrid(idle)
    if (!(await pause(idle === 0 ? 700 : 1000, signal))) break
  }
  window.scrollTo(0, 0)
  return best
}
