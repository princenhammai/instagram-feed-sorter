import { exportColumns, tableToCsv } from './export'
import { withEngagement, withOutlierScores } from './outlier'
import { median, withResearch } from './research'
import type { Post } from './types'

export const BATCH_KEY = 'ifs-batch'
export const BATCH_PROGRESS_KEY = 'ifs-batch-progress'
export const DEFAULT_DELAY_MS = 1200
export const MIN_DELAY_MS = 400
export const MAX_DELAY_MS = 10_000
export const DEFAULT_REELS = 100
export const MAX_REELS = 200
export const MAX_HANDLES = 40
export const THREE_X = 3

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
  error: string
}

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

export function resumeJob(job: BatchJob, now = Date.now()): BatchJob {
  if (job.index >= job.handles.length) return { ...job, status: 'done', updatedAt: now }
  return { ...job, status: 'running', note: undefined, updatedAt: now }
}

export function compactReel(post: Post): StoredReel {
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
  }
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
  }
}

export function scoreAccount(reels: StoredReel[], followers: number | null, now = Date.now()): Post[] {
  const posts = reels.map(postFromReel)
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
    error,
  }
}

export function batchReelTable(groups: { posts: Post[]; summary: AccountSummary }[]): (string | number | null)[][] {
  const columns = exportColumns()
  const headers = ['Account', ...columns.map((column) => column.header), 'Account median views', 'Reels at 3×+']
  const rows = groups.flatMap((group) =>
    group.posts.map((post) => [
      post.username,
      ...columns.map((column) => column.value(post)),
      group.summary.medianViews,
      group.summary.atLeast3x,
    ]),
  )
  return [headers, ...rows]
}

export function batchSummaryTable(summaries: AccountSummary[]): (string | number | null)[][] {
  const headers = ['Account', 'Reels loaded', 'Median views', 'Top reel', 'Top views', 'Reels at 3×+', 'Followers', 'Note']
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
      summary.error,
    ]),
  ]
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
