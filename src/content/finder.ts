import { followingPage, similarAccounts } from './api'
import { kickBatch, queueBatch } from './batch-run'
import { notify } from './store'
import { humanError } from '../lib/format'
import {
  CANDIDATE_KEY,
  DEFAULT_FOLLOWING,
  candidateFromAccount,
  candidateTable,
  clampChain,
  clampFollowing,
  mergeCandidates,
  visibleHandles,
  type Candidate,
} from '../lib/candidates'
import { clampDelay, clampReels, DEFAULT_DELAY_MS, DEFAULT_REELS, isRateLimited } from '../lib/batch'
import { tableToCsv } from '../lib/export'
import { downloadName, safeSegment } from '../lib/media-files'
import type { SimilarAccount } from '../lib/types'

const RESERVED = new Set(['explore', 'reels', 'reel', 'p', 'stories', 'accounts', 'direct', 'about', 'legal'])

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

export async function loadCandidates(): Promise<Candidate[]> {
  const stored = await chrome.storage.local.get(CANDIDATE_KEY)
  const value = stored[CANDIDATE_KEY]
  return Array.isArray(value) ? (value as Candidate[]) : []
}

async function saveCandidates(candidates: Candidate[]): Promise<void> {
  await chrome.storage.local.set({ [CANDIDATE_KEY]: candidates })
}

export function readVisibleHandles(): string[] {
  const dialog = document.querySelector('[role="dialog"]')
  if (!dialog) return []
  const hrefs = [...dialog.querySelectorAll('a[href]')].map((link) => link.getAttribute('href') || '')
  return visibleHandles(hrefs, RESERVED)
}

export async function scrollFollowingDialog(rounds: number, delayMs: number, signal: AbortSignal): Promise<string[]> {
  const names = new Set<string>(readVisibleHandles())
  const dialog = document.querySelector('[role="dialog"]')
  const scroller = dialog
    ? [...dialog.querySelectorAll('div')].find((node) => node.scrollHeight > node.clientHeight + 40)
    : null
  for (let round = 0; round < rounds && !signal.aborted; round += 1) {
    if (scroller) scroller.scrollTop = scroller.scrollHeight
    else window.scrollBy(0, 900)
    await sleep(delayMs, signal)
    for (const name of readVisibleHandles()) names.add(name)
  }
  return [...names]
}

export function openFollowingList(username: string): void {
  const link = document.querySelector(`a[href="/${username}/following/"]`)
  if (link instanceof HTMLElement) link.click()
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export async function collectCandidates(options: {
  username: string
  chain: number
  followingCap: number
  scrollRounds: number
  delayMs: number
  signal: AbortSignal
  onProgress?: (label: string) => void
}): Promise<{ added: Candidate[]; all: Candidate[]; error?: string }> {
  const delayMs = clampDelay(options.delayMs)
  const chain = clampChain(options.chain)
  const followingCap = clampFollowing(options.followingCap)
  const incoming: Candidate[] = []
  const seen = new Set<string>([options.username.toLowerCase()])
  const notes: string[] = []
  const remember = (error: unknown) => {
    if (isAbort(error)) throw error
    const message = humanError(error)
    if (message && !notes.includes(message)) notes.push(message)
  }
  const blocked = () => notes.some((note) => isRateLimited(note))
  const take = (accounts: SimilarAccount[], source: string) => {
    for (const account of accounts) {
      const key = account.username.toLowerCase()
      if (!key || key === options.username.toLowerCase() || seen.has(`${source}:${key}`)) continue
      seen.add(`${source}:${key}`)
      incoming.push(candidateFromAccount(account, source))
    }
  }

  try {
    options.onProgress?.(`Suggested for @${options.username}`)
    const suggested = await similarAccounts(options.username)
    take(suggested, `suggested from ${options.username}`)
    const expand = blocked() ? [] : suggested.slice(0, chain)
    for (const account of expand) {
      if (options.signal.aborted) break
      await sleep(delayMs, options.signal)
      options.onProgress?.(`Suggested from @${account.username}`)
      try {
        const next = await similarAccounts(account.username)
        take(next, `suggested from ${account.username} via ${options.username}`)
      } catch (error) {
        remember(error)
      }
    }
  } catch (error) {
    remember(error)
  }

  if (options.scrollRounds > 0 && !options.signal.aborted && !blocked()) {
    try {
      options.onProgress?.('Reading the open following list')
      openFollowingList(options.username)
      await sleep(Math.min(delayMs, 800), options.signal).catch(() => undefined)
      const visible = await scrollFollowingDialog(options.scrollRounds, delayMs, options.signal).catch(() => readVisibleHandles())
      take(
        visible.map((username) => ({
          id: username,
          username,
          fullName: '',
          verified: false,
          url: `https://www.instagram.com/${username}/`,
          followers: null,
          avatarUrl: null,
          isPrivate: false,
          category: null,
          biography: null,
        })),
        `following of ${options.username}`,
      )
    } catch (error) {
      remember(error)
    }
  }

  if (followingCap > 0 && !options.signal.aborted && !blocked()) {
    let maxId: string | undefined
    let loaded = 0
    try {
      while (loaded < followingCap && !options.signal.aborted) {
        options.onProgress?.(`Following list ${loaded} of ${followingCap}`)
        await sleep(delayMs, options.signal)
        const page = await followingPage(options.username, maxId)
        take(page.accounts, `following of ${options.username}`)
        loaded += page.accounts.length
        if (!page.nextMaxId || page.nextMaxId === maxId || page.accounts.length === 0) break
        maxId = page.nextMaxId
      }
    } catch (error) {
      remember(error)
    }
  }

  const merged = mergeCandidates(await loadCandidates(), incoming)
  await saveCandidates(merged.all)
  return { ...merged, error: notes.join(' ') || undefined }
}

export async function exportCandidates(candidates: Candidate[]): Promise<string> {
  const response = (await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_TEXT',
    filename: downloadName(`${safeSegment('account-candidates')}.csv`),
    mime: 'text/csv;charset=utf-8',
    text: tableToCsv(candidateTable(candidates)),
  })) as { ok?: boolean; error?: string } | undefined
  if (!response?.ok) throw new Error(response?.error || 'Chrome did not save the candidate list.')
  return `Saved ${candidates.length} accounts.`
}

export async function sendCandidatesToBatch(candidates: Candidate[], reelsPerAccount = DEFAULT_REELS, delayMs = DEFAULT_DELAY_MS): Promise<void> {
  const handles = candidates.map((candidate) => candidate.username).slice(0, 40)
  if (handles.length === 0) {
    notify('No new accounts to batch.')
    return
  }
  const url = await queueBatch(handles, clampReels(reelsPerAccount), clampDelay(delayMs))
  const here = location.pathname.replace(/\/+$/, '')
  const want = `/${handles[0]}/reels`
  if (here.toLowerCase() === want.toLowerCase()) kickBatch()
  else location.assign(url)
}

export { DEFAULT_FOLLOWING }
