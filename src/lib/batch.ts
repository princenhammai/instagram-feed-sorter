import { exportColumns, tableToCsv } from './export'
import { withEngagement, withOutlierScores } from './outlier'
import { median, withResearch } from './research'
import type { Post } from './types'

export const BATCH_KEY = 'ifs-batch'
export const BATCH_PROGRESS_KEY = 'ifs-batch-progress'
export const DEFAULT_DELAY_MS = 1200
export const MIN_DELAY_MS = 400
export const MAX_DELAY_MS = 10_000
/** Wait this long between accounts before reading the next Reels grid. */
export const ACCOUNT_GAP_MIN_MS = 8_000
export const ACCOUNT_GAP_MAX_MS = 20_000
export const SLOWDOWN_MESSAGE = 'Instagram asked us to slow down — wait at least a few hours'
export const SLOWDOWN_MS = 4 * 60 * 60 * 1000

/** Random gap from 8s through 20s, inclusive when `random` can return values in [0, 1). */
export function accountGapMs(random: () => number = Math.random): number {
  const span = ACCOUNT_GAP_MAX_MS - ACCOUNT_GAP_MIN_MS
  return ACCOUNT_GAP_MIN_MS + Math.floor(random() * (span + 1))
}

export function cooldownActive(until: number | undefined, now = Date.now()): boolean {
  return typeof until === 'number' && Number.isFinite(until) && until > now
}
export const DEFAULT_REELS = 100
export const MAX_REELS = 200
export const MAX_HANDLES = 40
export const THREE_X = 3
export const SEEN_KEY = 'ifs-seen-reels'
export const SEEN_LIMIT = 20_000

const SKIPPED = new Set(['explore', 'reels', 'reel', 'p', 'stories', 'accounts', 'direct', 'about', 'legal'])

export interface StoredReel {
  id: string
  username: string
  shortcode: string
  url: string
  caption: string
  takenAt: number
  views: number | null
  likes: number | null
  comments: number | null
  duration: number | null
  audio: string | null
  paidPartnership: boolean
  seenBefore?: boolean
}

export interface AccountResult {
  username: string
  status: 'done' | 'error'
  error?: string
  followers: number | null
  reels: StoredReel[]
}

export interface BatchJob {
  id: string
  handles: string[]
  reelsPerAccount: number
  delayMs: number
  index: number
  accounts: AccountResult[]
  status: 'running' | 'paused' | 'done'
  note?: string
  /** Resume stays disabled until this time after Instagram asks us to slow down. */
  cooldownUntil?: number
  updatedAt: number
}

export interface BatchProgress {
  index: number
  total: number
  handle: string
  collected: number
  limit: number
  label: string
}

export interface AccountSummary {
  username: string
  loaded: number
  medianViews: number | null
  topPermalink: string
  topViews: number | null
  atLeast3x: number
  followers: number | null
  fresh: number
  repeats: number
  error: string
}

export interface SeenReel {
  username: string
  shortcode: string
  seenAt: number
}

export interface AccountSnapshot {
  followers: number | null
  posts: Post[]
  interrupted?: string | null
  stopped?: boolean
  aborted?: boolean
  thrown?: string | null
}

export type AccountDecision =
  | { type: 'pause'; job: BatchJob; message: string }
  | { type: 'saved'; job: BatchJob }

export function clampDelay(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DELAY_MS
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, Math.round(value)))
}

export function clampReels(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REELS
  return Math.min(MAX_REELS, Math.max(1, Math.round(value)))
}

function acceptHandle(raw: string, found: string[], seen: Set<string>): void {
  const fromUrl = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  let name = (fromUrl?.[1] ?? raw).replace(/^@+/, '')
  name = name.split(/[/?#]/)[0] ?? ''
  if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) return
  if (SKIPPED.has(name.toLowerCase())) return
  const key = name.toLowerCase()
  if (seen.has(key) || found.length >= MAX_HANDLES) return
  seen.add(key)
  found.push(name)
}

export function parseHandles(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const chunk of text.split(/[\n,;]+/)) {
    const raw = chunk.trim()
    if (!raw) continue
    if (/instagram\.com\//i.test(raw)) {
      acceptHandle(raw, found, seen)
      continue
    }
    if (/\s/.test(raw)) {
      for (const token of raw.split(/\s+/)) {
        if (token.startsWith('@')) acceptHandle(token, found, seen)
      }
      continue
    }
    acceptHandle(raw, found, seen)
  }
  return found
}

export function reelsUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/reels/`
}

export function createJob(handles: string[], reelsPerAccount: number, delayMs: number, now = Date.now()): BatchJob {
  return {
    id: `batch-${now}`,
    handles,
    reelsPerAccount: clampReels(reelsPerAccount),
    delayMs: clampDelay(delayMs),
    index: 0,
    accounts: [],
    status: 'running',
    updatedAt: now,
  }
}

export function currentHandle(job: BatchJob): string | null {
  if (job.status !== 'running') return null
  return job.handles[job.index] ?? null
}

export function withAccount(job: BatchJob, account: AccountResult, now = Date.now()): BatchJob {
  const accounts = job.accounts.filter((item) => item.username.toLowerCase() !== account.username.toLowerCase())
  accounts.push(account)
  const index = Math.min(job.handles.length, job.index + 1)
  return {
    ...job,
    accounts,
    index,
    status: index >= job.handles.length ? 'done' : 'running',
    note: undefined,
    updatedAt: now,
  }
}

export function pauseJob(job: BatchJob, note?: string, now = Date.now()): BatchJob {
  return { ...job, status: 'paused', note: note || job.note, updatedAt: now }
}

export function pauseForSlowdown(job: BatchJob, now = Date.now()): BatchJob {
  return { ...job, status: 'paused', note: SLOWDOWN_MESSAGE, cooldownUntil: now + SLOWDOWN_MS, updatedAt: now }
}

export function resumeJob(job: BatchJob, now = Date.now()): BatchJob {
  if (cooldownActive(job.cooldownUntil, now)) {
    return { ...job, status: 'paused', note: SLOWDOWN_MESSAGE, updatedAt: now }
  }
  const ready = job.cooldownUntil ? { ...job, cooldownUntil: undefined } : job
  if (ready.index >= ready.handles.length) {
    if (ready.accounts.length > 0 && ready.accounts.every((account) => account.reels.length === 0)) {
      return { ...ready, status: 'running', index: 0, accounts: [], note: undefined, updatedAt: now }
    }
    return { ...ready, status: 'done', updatedAt: now }
  }
  return { ...ready, status: 'running', note: undefined, updatedAt: now }
}

export function reelKey(username: string, shortcode: string): string {
  return `${username.trim().toLowerCase()}:${shortcode.trim()}`
}

const REAL_LIMIT = /\bHTTP\s+429\b|\bfeedback_required\b/i

export function isRateLimited(message: string | null | undefined, status?: number): boolean {
  if (status === 429) return true
  if (!message) return false
  return REAL_LIMIT.test(message)
}

export function compactReel(post: Post, seenBefore = false): StoredReel {
  return {
    id: post.id,
    username: post.username,
    shortcode: post.shortcode,
    url: post.url,
    caption: post.caption.slice(0, 280),
    takenAt: post.takenAt,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    duration: post.duration ?? null,
    audio: post.audio ?? null,
    paidPartnership: Boolean(post.paidPartnership),
    seenBefore: seenBefore || Boolean(post.seenBefore),
  }
}

export function uniquePosts(posts: Post[]): Post[] {
  const seen = new Set<string>()
  const unique: Post[] = []
  for (const post of posts) {
    const key = reelKey(post.username, post.shortcode || post.id)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(post)
  }
  return unique
}

export function uniqueReels(reels: StoredReel[]): StoredReel[] {
  const seen = new Set<string>()
  const unique: StoredReel[] = []
  for (const reel of reels) {
    const key = reelKey(reel.username, reel.shortcode || reel.id)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(reel)
  }
  return unique
}

export function postFromReel(reel: StoredReel): Post {
  return {
    id: reel.id,
    shortcode: reel.shortcode,
    username: reel.username,
    url: reel.url,
    caption: reel.caption,
    takenAt: reel.takenAt,
    likes: reel.likes,
    comments: reel.comments,
    views: reel.views,
    mediaKind: 'video',
    coverUrl: null,
    videoUrl: null,
    slides: [],
    duration: reel.duration,
    audio: reel.audio,
    paidPartnership: reel.paidPartnership,
    seenBefore: Boolean(reel.seenBefore),
  }
}

export function scoreAccount(reels: StoredReel[], followers: number | null, now = Date.now()): Post[] {
  const posts = uniqueReels(reels).map(postFromReel)
  return withResearch(withEngagement(withOutlierScores(posts, 'views', now), followers))
}

export function summarizeAccount(username: string, posts: Post[], followers: number | null, error = ''): AccountSummary {
  const views = posts.map((post) => post.views).filter((value): value is number => value != null && value >= 0)
  const top = [...posts].sort((a, b) => (b.views ?? -1) - (a.views ?? -1))[0]
  return {
    username,
    loaded: posts.length,
    medianViews: median(views),
    topPermalink: top?.url ?? '',
    topViews: top?.views ?? null,
    atLeast3x: posts.filter((post) => (post.medianScore ?? 0) >= THREE_X).length,
    followers,
    fresh: posts.filter((post) => !post.seenBefore).length,
    repeats: posts.filter((post) => post.seenBefore).length,
    error,
  }
}

export function batchReelTable(groups: { posts: Post[]; summary: AccountSummary }[]): (string | number | null)[][] {
  const columns = exportColumns()
  const headers = ['Account', ...columns.map((column) => column.header), 'Account median views', 'Reels at 3×+', 'Seen before']
  const rows = groups.flatMap((group) =>
    group.posts.map((post) => [
      post.username,
      ...columns.map((column) => column.value(post)),
      group.summary.medianViews,
      group.summary.atLeast3x,
      post.seenBefore ? 'Yes' : 'No',
    ]),
  )
  return [headers, ...rows]
}

export function batchSummaryTable(summaries: AccountSummary[]): (string | number | null)[][] {
  const headers = ['Account', 'Reels loaded', 'Median views', 'Top reel', 'Top views', 'Reels at 3×+', 'Followers', 'New reels', 'Already seen', 'Note']
  return [
    headers,
    ...summaries.map((summary) => [
      summary.username,
      summary.loaded,
      summary.medianViews,
      summary.topPermalink,
      summary.topViews,
      summary.atLeast3x,
      summary.followers,
      summary.fresh,
      summary.repeats,
      summary.error,
    ]),
  ]
}

export function batchFreshTable(groups: { posts: Post[]; summary: AccountSummary }[]): (string | number | null)[][] {
  const fresh = groups
    .map((group) => ({ ...group, posts: group.posts.filter((post) => !post.seenBefore) }))
    .filter((group) => group.posts.length > 0)
  if (fresh.length === 0) return [['Account', 'Note'], ['', 'Every loaded Reel was already in a previous run.']]
  return batchReelTable(fresh)
}

export function batchCsv(groups: { posts: Post[]; summary: AccountSummary }[]): string {
  return tableToCsv(batchReelTable(groups))
}

export function accountGroups(job: BatchJob, now = Date.now()): { posts: Post[]; summary: AccountSummary }[] {
  return job.accounts.map((account) => {
    const posts = account.status === 'done' ? scoreAccount(account.reels, account.followers, now) : []
    return { posts, summary: summarizeAccount(account.username, posts, account.followers, account.error ?? '') }
  })
}

export function progressLabel(job: BatchJob, collected: number): BatchProgress {
  const handle = job.handles[job.index] ?? job.handles[job.handles.length - 1] ?? ''
  return {
    index: Math.min(job.index + 1, job.handles.length),
    total: job.handles.length,
    handle,
    collected,
    limit: job.reelsPerAccount,
    label: `${handle}: ${collected} of ${job.reelsPerAccount} reels`,
  }
}

export function isBatchJob(value: unknown): value is BatchJob {
  if (!value || typeof value !== 'object') return false
  const job = value as BatchJob
  return Array.isArray(job.handles) && Array.isArray(job.accounts) && typeof job.index === 'number'
}

export function seenKeySet(entries: SeenReel[]): Set<string> {
  return new Set(entries.map((item) => reelKey(item.username, item.shortcode)))
}

export function mergeSeen(existing: SeenReel[], incoming: SeenReel[], limit = SEEN_LIMIT): SeenReel[] {
  const map = new Map<string, SeenReel>()
  for (const item of [...existing, ...incoming]) {
    if (!item?.username || !item.shortcode) continue
    const key = reelKey(item.username, item.shortcode)
    if (map.has(key)) continue
    map.set(key, { username: item.username, shortcode: item.shortcode, seenAt: item.seenAt })
  }
  const all = [...map.values()]
  if (all.length <= limit) return all
  return all.sort((a, b) => b.seenAt - a.seenAt).slice(0, limit)
}

export function seenFromReels(reels: StoredReel[], now = Date.now()): SeenReel[] {
  return reels
    .filter((reel) => reel.username && reel.shortcode)
    .map((reel) => ({ username: reel.username, shortcode: reel.shortcode, seenAt: now }))
}

function postsFrom(snapshot: AccountSnapshot): Post[] {
  return uniquePosts(snapshot.posts)
}

export function applyAccountOutcome(
  job: BatchJob,
  handle: string,
  snapshot: AccountSnapshot,
  known: Set<string> = new Set(),
  now = Date.now(),
): AccountDecision {
  if (snapshot.aborted || snapshot.stopped) {
    return { type: 'pause', job: pauseJob(job, 'Paused.', now), message: 'Paused.' }
  }
  const thrown = snapshot.thrown?.trim() || ''
  if (thrown && isRateLimited(thrown)) {
    return { type: 'pause', job: pauseForSlowdown(job, now), message: SLOWDOWN_MESSAGE }
  }
  const interrupted = snapshot.interrupted?.trim() || ''
  if (interrupted && isRateLimited(interrupted)) {
    return { type: 'pause', job: pauseForSlowdown(job, now), message: SLOWDOWN_MESSAGE }
  }
  if (thrown || postsFrom(snapshot).length === 0) {
    const message = thrown || interrupted || 'No reels came back from this profile grid.'
    const next = withAccount(
      job,
      { username: handle, status: 'error', error: message, followers: snapshot.followers, reels: [] },
      now,
    )
    if (next.status === 'done' && next.accounts.every((account) => account.reels.length === 0)) {
      return { type: 'pause', job: pauseJob(next, message, now), message }
    }
    return { type: 'saved', job: next }
  }
  const posts = postsFrom(snapshot)
  return {
    type: 'saved',
    job: withAccount(
      job,
      {
        username: handle,
        status: 'done',
        followers: snapshot.followers,
        reels: posts.map((post) => {
          const username = post.username || handle
          return compactReel({ ...post, username }, known.has(reelKey(username, post.shortcode)))
        }),
      },
      now,
    ),
  }
}

function chartEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function chartRows(summaries: AccountSummary[], pick: (summary: AccountSummary) => number, color: string): string {
  const max = Math.max(1, ...summaries.map(pick))
  return summaries
    .map((summary, index) => {
      const value = pick(summary)
      const y = index * 36
      const width = Math.max(2, Math.round((value / max) * 420))
      const label = chartEscape(summary.username)
      return `<g transform="translate(0 ${y})"><text x="0" y="18" fill="#d5dae3" font-size="13">${label}</text><rect x="148" y="4" width="${width}" height="20" rx="4" fill="${color}"></rect><text x="${156 + width}" y="18" fill="#9aa3b2" font-size="12">${value}</text></g>`
    })
    .join('')
}

export function summaryChartHtml(summaries: AccountSummary[]): string {
  const height = Math.max(72, summaries.length * 36 + 8)
  const medianChart = chartRows(summaries, (summary) => summary.medianViews ?? 0, '#7aa2ff')
  const breakoutChart = chartRows(summaries, (summary) => summary.atLeast3x, '#f0b429')
  const fresh = summaries.reduce((sum, summary) => sum + summary.fresh, 0)
  const repeats = summaries.reduce((sum, summary) => sum + summary.repeats, 0)
  return `<!DOCTYPE html>
<html lang="en">
<meta charset="utf-8">
<title>Batch account summary</title>
<style>
  body { margin: 0; padding: 28px; background: #14161c; color: #f4f6f8; font: 15px/1.45 Inter, Segoe UI, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  p { color: #9aa3b2; margin: 0 0 22px; }
  h2 { font-size: 16px; margin: 28px 0 10px; }
  svg { display: block; max-width: 100%; background: #1c2028; border-radius: 12px; }
</style>
<h1>Per-account summary</h1>
<p>${fresh} new Reels · ${repeats} already seen on this browser. Bars use each account's own median.</p>
<h2>Median views</h2>
<svg viewBox="0 0 680 ${height}" width="680" height="${height}" role="img">${medianChart}</svg>
<h2>Reels at 3× the account median</h2>
<svg viewBox="0 0 680 ${height}" width="680" height="${height}" role="img">${breakoutChart}</svg>
</html>
`
}
