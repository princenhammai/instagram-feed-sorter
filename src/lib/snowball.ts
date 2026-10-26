import { clampDelay, compactReel, type StoredReel } from './batch'
import { tableToCsv } from './export'
import { withEngagement } from './outlier'
import { median, withResearch } from './research'
import type { Post } from './types'

export const SNOWBALL_KEY = 'ifs-snowball'
export const SNOWBALL_PROGRESS_KEY = 'ifs-snowball-progress'
export const DEFAULT_SNOWBALL_REELS = 30
export const MAX_SNOWBALL_REELS = 100
export const DEFAULT_FOLLOWING_CAP = 40
export const DEFAULT_SUGGESTED_CAP = 20
export const DEFAULT_TARGET_STRONG = 20
export const DEFAULT_MAX_DEPTH = 2
export const DEFAULT_MIN_STRONG_RATIO = 0.2
export const DEFAULT_DAILY_CAP = 40
export const DEFAULT_STRONG_BREAKOUTS = 2
export const DEFAULT_STRONG_MEDIAN = 10_000
export const DEFAULT_MAYBE_BREAKOUTS = 1
export const DEFAULT_MAYBE_MEDIAN = 1_000
export const MAX_SEEDS = 20
export const MAX_KEYWORDS = 10
export const DEFAULT_SEARCH_CAP = 15
export const MAX_QUEUE = 300

const RESERVED = new Set(['explore', 'reels', 'reel', 'p', 'stories', 'accounts', 'direct', 'about', 'legal'])

export type Grade = 'STRONG' | 'MAYBE' | 'WEAK' | 'ERROR'
export type CandidateVia = 'following' | 'suggested' | 'search'

export interface SnowballSettings {
  reelsPerAccount: number
  delayMs: number
  strongBreakouts: number
  strongMedianViews: number
  maybeBreakouts: number
  maybeMedianViews: number
  minEngagement: number | null
  followingCap: number
  suggestedCap: number
  targetStrong: number
  maxDepth: number
  minStrongRatio: number
  dailyCap: number
  minFollowers: number | null
  maxFollowers: number | null
  searchCap: number
}

export interface SourceRef {
  from: string
  via: CandidateVia
}

export interface QueueItem {
  username: string
  depth: number
  score: number
  followers: number | null
  sources: SourceRef[]
}

export interface ScoredAccount {
  username: string
  depth: number
  grade: Grade
  medianViews: number | null
  breakouts: number
  engagementRate: number | null
  followers: number | null
  loaded: number
  provenance: string
  sources: SourceRef[]
  reels: StoredReel[]
  error?: string
}

export interface SnowballJob {
  id: string
  settings: SnowballSettings
  status: 'running' | 'paused' | 'done'
  note?: string
  phase: 'search' | 'score' | 'expand'
  depth: number
  roundScored: number
  roundStrong: number
  scoredToday: number
  day: string
  queue: QueueItem[]
  seen: string[]
  expanded: string[]
  accounts: ScoredAccount[]
  seeds: string[]
  keywords: string[]
  searched: string[]
  searchNote?: string
  updatedAt: number
}

export interface SnowballStep {
  type: 'search' | 'score' | 'expand' | 'pause' | 'done'
  username?: string
  keyword?: string
  depth?: number
  note?: string
}

export interface ScoreInput {
  username: string
  followers: number | null
  posts: Post[]
  error?: string
}

export interface IncomingCandidate {
  username: string
  followers: number | null
  via: CandidateVia
}

export interface SearchHit {
  username: string
  followers: number | null
}

const DEFAULTS: SnowballSettings = {
  reelsPerAccount: DEFAULT_SNOWBALL_REELS,
  delayMs: 1200,
  strongBreakouts: DEFAULT_STRONG_BREAKOUTS,
  strongMedianViews: DEFAULT_STRONG_MEDIAN,
  maybeBreakouts: DEFAULT_MAYBE_BREAKOUTS,
  maybeMedianViews: DEFAULT_MAYBE_MEDIAN,
  minEngagement: null,
  followingCap: DEFAULT_FOLLOWING_CAP,
  suggestedCap: DEFAULT_SUGGESTED_CAP,
  targetStrong: DEFAULT_TARGET_STRONG,
  maxDepth: DEFAULT_MAX_DEPTH,
  minStrongRatio: DEFAULT_MIN_STRONG_RATIO,
  dailyCap: DEFAULT_DAILY_CAP,
  minFollowers: null,
  maxFollowers: null,
  searchCap: DEFAULT_SEARCH_CAP,
}

function clampInt(value: number | null | undefined, fallback: number, min: number, max: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampRatio(value: number | null | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

function optionalCount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.max(0, Math.round(value))
}

export function snowballSettings(input: Partial<SnowballSettings> = {}): SnowballSettings {
  const minEngagement = input.minEngagement == null || !Number.isFinite(input.minEngagement) ? null : Math.min(1, Math.max(0, input.minEngagement))
  return {
    reelsPerAccount: clampInt(input.reelsPerAccount, DEFAULTS.reelsPerAccount, 1, MAX_SNOWBALL_REELS),
    delayMs: clampDelay(input.delayMs ?? DEFAULTS.delayMs),
    strongBreakouts: clampInt(input.strongBreakouts, DEFAULTS.strongBreakouts, 1, 30),
    strongMedianViews: clampInt(input.strongMedianViews, DEFAULTS.strongMedianViews, 0, 1_000_000_000),
    maybeBreakouts: clampInt(input.maybeBreakouts, DEFAULTS.maybeBreakouts, 0, 30),
    maybeMedianViews: clampInt(input.maybeMedianViews, DEFAULTS.maybeMedianViews, 0, 1_000_000_000),
    minEngagement,
    followingCap: clampInt(input.followingCap, DEFAULTS.followingCap, 0, 80),
    suggestedCap: clampInt(input.suggestedCap, DEFAULTS.suggestedCap, 0, 40),
    targetStrong: clampInt(input.targetStrong, DEFAULTS.targetStrong, 1, 200),
    maxDepth: clampInt(input.maxDepth, DEFAULTS.maxDepth, 0, 6),
    minStrongRatio: clampRatio(input.minStrongRatio, DEFAULTS.minStrongRatio),
    dailyCap: clampInt(input.dailyCap, DEFAULTS.dailyCap, 1, 200),
    minFollowers: optionalCount(input.minFollowers),
    maxFollowers: optionalCount(input.maxFollowers),
    searchCap: clampInt(input.searchCap, DEFAULTS.searchCap, 1, 40),
  }
}

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

export function usableUsername(value: string): boolean {
  return /^[A-Za-z0-9._]{1,30}$/.test(value) && !RESERVED.has(value.toLowerCase())
}

export function countStrong(job: SnowballJob): number {
  return job.accounts.filter((account) => account.grade === 'STRONG').length
}

export function provenanceText(sources: SourceRef[]): string {
  if (sources.length === 0) return 'seed'
  const unique = (via: CandidateVia) => [...new Set(sources.filter((source) => source.via === via).map((source) => source.from))]
  const parts = [
    unique('following').length ? `followed by ${unique('following').join(', ')}` : '',
    unique('suggested').length ? `suggested by ${unique('suggested').join(', ')}` : '',
    ...unique('search').map((keyword) => `search: ${keyword}`),
  ].filter(Boolean)
  return parts.join('; ')
}

export function parseKeywords(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const chunk of text.split(/[\n,;]+/)) {
    const keyword = chunk.trim().replace(/\s+/g, ' ')
    if (!keyword || keyword.length > 80) continue
    const key = keyword.toLowerCase()
    if (seen.has(key) || found.length >= MAX_KEYWORDS) continue
    seen.add(key)
    found.push(keyword)
  }
  return found
}

function priority(sources: SourceRef[]): number {
  return new Set(sources.filter((source) => source.via !== 'search').map((source) => source.from.toLowerCase())).size
}

function normalizeJob(job: SnowballJob): SnowballJob {
  return {
    ...job,
    keywords: Array.isArray(job.keywords) ? job.keywords : [],
    searched: Array.isArray(job.searched) ? job.searched : [],
    settings: { ...snowballSettings(), ...job.settings, searchCap: job.settings?.searchCap ?? DEFAULT_SEARCH_CAP },
  }
}

export function createSnowball(seeds: string[], input: Partial<SnowballSettings> = {}, now = Date.now(), keywords: string[] = []): SnowballJob {
  const settings = snowballSettings(input)
  const queue: QueueItem[] = []
  const seen: string[] = []
  for (const seed of seeds) {
    if (!usableUsername(seed) || seen.includes(seed.toLowerCase()) || queue.length >= MAX_SEEDS) continue
    seen.push(seed.toLowerCase())
    queue.push({ username: seed, depth: 0, score: 0, followers: null, sources: [] })
  }
  const terms = parseKeywords(keywords.join('\n'))
  return {
    id: `snowball-${now}`,
    settings,
    status: 'running',
    phase: terms.length > 0 ? 'search' : 'score',
    depth: 0,
    roundScored: 0,
    roundStrong: 0,
    scoredToday: 0,
    day: utcDay(now),
    queue,
    seen,
    expanded: [],
    accounts: [],
    seeds: queue.map((item) => item.username),
    keywords: terms,
    searched: [],
    updatedAt: now,
  }
}

export function isSnowballJob(value: unknown): value is SnowballJob {
  if (!value || typeof value !== 'object') return false
  const job = value as SnowballJob
  return Array.isArray(job.queue) && Array.isArray(job.accounts) && Array.isArray(job.seen) && typeof job.depth === 'number' && Boolean(job.settings)
}

function refreshDay(job: SnowballJob, now: number): SnowballJob {
  const day = utcDay(now)
  if (job.day === day) return job
  return { ...job, day, scoredToday: 0 }
}

export function pauseSnowball(job: SnowballJob, note?: string, now = Date.now()): SnowballJob {
  return { ...job, status: 'paused', note: note || job.note, updatedAt: now }
}

export function resumeSnowball(job: SnowballJob, now = Date.now()): SnowballJob {
  if (job.status === 'done') return { ...job, updatedAt: now }
  return { ...refreshDay(job, now), status: 'running', note: undefined, updatedAt: now }
}

function finishSnowball(job: SnowballJob, note: string, now: number): SnowballJob {
  return { ...job, status: 'done', note, updatedAt: now }
}

function scoredName(job: SnowballJob, username: string): boolean {
  const key = username.toLowerCase()
  return job.accounts.some((account) => account.username.toLowerCase() === key)
}

function pendingAtDepth(job: SnowballJob): QueueItem[] {
  return job.queue
    .filter((item) => item.depth === job.depth && !scoredName(job, item.username))
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
}

function nextStrongToExpand(job: SnowballJob): string | null {
  const account = job.accounts.find(
    (item) => item.grade === 'STRONG' && item.depth === job.depth && !job.expanded.includes(item.username.toLowerCase()),
  )
  return account?.username ?? null
}

function nextKeyword(job: SnowballJob): string | undefined {
  const done = new Set((job.searched ?? []).map((keyword) => keyword.toLowerCase()))
  return (job.keywords ?? []).find((keyword) => !done.has(keyword.toLowerCase()))
}

export function plan(job: SnowballJob, now = Date.now()): { job: SnowballJob; step: SnowballStep } {
  let current = refreshDay(normalizeJob(job), now)
  for (let hop = 0; hop < 12; hop += 1) {
    if (current.status !== 'running') {
      return { job: current, step: { type: current.status === 'paused' ? 'pause' : 'done', note: current.note || current.status } }
    }
    if (current.scoredToday >= current.settings.dailyCap) {
      current = pauseSnowball(current, 'Daily cap reached. Resume on the next UTC day.', now)
      return { job: current, step: { type: 'pause', note: current.note } }
    }
    if (countStrong(current) >= current.settings.targetStrong) {
      const found = countStrong(current)
      current = finishSnowball(current, `Reached ${found} STRONG ${found === 1 ? 'account' : 'accounts'}.`, now)
      return { job: current, step: { type: 'done', note: current.note } }
    }
    if (current.phase === 'search') {
      const keyword = nextKeyword(current)
      if (keyword) return { job: current, step: { type: 'search', keyword } }
      current = { ...current, phase: 'score', updatedAt: now }
      continue
    }
    if (current.phase === 'score') {
      const pending = pendingAtDepth(current)
      if (pending.length > 0) {
        return { job: current, step: { type: 'score', username: pending[0].username, depth: current.depth } }
      }
      if (current.roundScored > 0 && current.roundStrong / current.roundScored < current.settings.minStrongRatio) {
        const pct = Math.round((current.roundStrong / current.roundScored) * 100)
        current = finishSnowball(current, `Depth ${current.depth} was ${pct}% STRONG, under the cutoff.`, now)
        return { job: current, step: { type: 'done', note: current.note } }
      }
      if (current.depth >= current.settings.maxDepth) {
        current = finishSnowball(current, 'Reached max depth.', now)
        return { job: current, step: { type: 'done', note: current.note } }
      }
      current = { ...current, phase: 'expand', updatedAt: now }
      continue
    }
    const next = nextStrongToExpand(current)
    if (next) return { job: current, step: { type: 'expand', username: next } }
    const depth = current.depth + 1
    current = { ...current, depth, phase: 'score', roundScored: 0, roundStrong: 0, updatedAt: now }
    if (!current.queue.some((item) => item.depth === depth)) {
      current = finishSnowball(current, 'No further accounts to score.', now)
      return { job: current, step: { type: 'done', note: current.note } }
    }
  }
  current = finishSnowball(current, 'Stopped.', now)
  return { job: current, step: { type: 'done', note: current.note } }
}

export function metricsFor(posts: Post[], followers: number | null): { medianViews: number | null; breakouts: number; engagementRate: number | null; loaded: number } {
  const scored = withResearch(withEngagement(posts, followers))
  const views = scored.map((post) => post.views).filter((value): value is number => value != null && value >= 0)
  const rates = scored.map((post) => post.engagementRate).filter((value): value is number => value != null)
  return {
    medianViews: median(views),
    breakouts: scored.filter((post) => (post.medianScore ?? 0) >= 3 && !post.likelyPaid).length,
    engagementRate: median(rates),
    loaded: scored.length,
  }
}

export function gradeMetrics(
  metrics: { medianViews: number | null; breakouts: number; engagementRate: number | null; loaded: number },
  settings: SnowballSettings,
): Grade {
  if (metrics.loaded === 0) return 'ERROR'
  const engagementOk = settings.minEngagement == null || (metrics.engagementRate != null && metrics.engagementRate >= settings.minEngagement)
  const medianViews = metrics.medianViews ?? 0
  if (metrics.breakouts >= settings.strongBreakouts && medianViews >= settings.strongMedianViews && engagementOk) return 'STRONG'
  if (metrics.breakouts >= settings.maybeBreakouts && medianViews >= settings.maybeMedianViews) return 'MAYBE'
  return 'WEAK'
}

export function applyScore(job: SnowballJob, input: ScoreInput, now = Date.now()): SnowballJob {
  if (scoredName(job, input.username)) return job
  const queued = job.queue.find((item) => item.username.toLowerCase() === input.username.toLowerCase())
  const metrics = input.error ? { medianViews: null, breakouts: 0, engagementRate: null, loaded: 0 } : metricsFor(input.posts, input.followers)
  const grade = input.error ? 'ERROR' : gradeMetrics(metrics, job.settings)
  const account: ScoredAccount = {
    username: queued?.username || input.username,
    depth: queued?.depth ?? job.depth,
    grade,
    medianViews: metrics.medianViews,
    breakouts: metrics.breakouts,
    engagementRate: metrics.engagementRate,
    followers: input.followers,
    loaded: metrics.loaded,
    provenance: provenanceText(queued?.sources ?? []),
    sources: queued?.sources ?? [],
    reels: input.error ? [] : input.posts.map((post) => compactReel(post)),
    error: input.error,
  }
  return {
    ...job,
    accounts: [...job.accounts, account],
    queue: job.queue.filter((item) => item.username.toLowerCase() !== input.username.toLowerCase()),
    roundScored: job.roundScored + 1,
    roundStrong: job.roundStrong + (grade === 'STRONG' ? 1 : 0),
    scoredToday: job.scoredToday + 1,
    updatedAt: now,
  }
}

function allowsFollowers(followers: number | null, settings: SnowballSettings): boolean {
  if (followers == null) return true
  if (settings.minFollowers != null && followers < settings.minFollowers) return false
  if (settings.maxFollowers != null && followers > settings.maxFollowers) return false
  return true
}

export function applyCandidates(job: SnowballJob, fromUsername: string, incoming: IncomingCandidate[], now = Date.now()): SnowballJob {
  const parent = job.accounts.find((account) => account.username.toLowerCase() === fromUsername.toLowerCase())
  if (!parent || parent.grade !== 'STRONG') return job
  const depth = parent.depth + 1
  let queue = job.queue.map((item) => ({ ...item, sources: [...item.sources] }))
  const seen = new Set(job.seen)
  for (const candidate of incoming) {
    if (!usableUsername(candidate.username)) continue
    const key = candidate.username.toLowerCase()
    if (key === parent.username.toLowerCase() || job.accounts.some((account) => account.username.toLowerCase() === key)) continue
    if (!allowsFollowers(candidate.followers, job.settings)) continue
    const source: SourceRef = { from: parent.username, via: candidate.via }
    const existing = queue.find((item) => item.username.toLowerCase() === key)
    if (existing) {
      if (!existing.sources.some((item) => item.from.toLowerCase() === source.from.toLowerCase() && item.via === source.via)) {
        existing.sources.push(source)
      }
      existing.score = priority(existing.sources)
      if (existing.followers == null && candidate.followers != null) existing.followers = candidate.followers
      seen.add(key)
      continue
    }
    if (seen.has(key) || queue.length >= MAX_QUEUE) continue
    seen.add(key)
    queue.push({
      username: candidate.username,
      depth,
      score: 1,
      followers: candidate.followers,
      sources: [source],
    })
  }
  return { ...job, queue, seen: [...seen], updatedAt: now }
}

export function applySearchCandidates(job: SnowballJob, keyword: string, hits: SearchHit[], now = Date.now(), done = true): SnowballJob {
  const current = normalizeJob(job)
  const label = keyword.trim().replace(/\s+/g, ' ')
  if (!label) return current
  let queue = current.queue.map((item) => ({ ...item, sources: [...item.sources] }))
  const seen = new Set(current.seen)
  const seeds = new Set(current.seeds.map((seed) => seed.toLowerCase()))
  const cap = current.settings.searchCap
  let fromKeyword = queue.filter((item) =>
    item.sources.some((source) => source.via === 'search' && source.from.toLowerCase() === label.toLowerCase()),
  ).length
  for (const hit of hits) {
    if (!usableUsername(hit.username)) continue
    const key = hit.username.toLowerCase()
    if (seeds.has(key) || !allowsFollowers(hit.followers, current.settings)) continue
    const source: SourceRef = { from: label, via: 'search' }
    const existing = queue.find((item) => item.username.toLowerCase() === key)
    if (existing) {
      if (!existing.sources.some((item) => item.via === 'search' && item.from.toLowerCase() === label.toLowerCase())) {
        existing.sources.push(source)
      }
      existing.score = priority(existing.sources)
      if (existing.followers == null && hit.followers != null) existing.followers = hit.followers
      seen.add(key)
      continue
    }
    if (seen.has(key) || current.accounts.some((account) => account.username.toLowerCase() === key)) continue
    if (fromKeyword >= cap || queue.length >= MAX_QUEUE) continue
    fromKeyword += 1
    seen.add(key)
    queue.push({
      username: hit.username,
      depth: 0,
      score: 0,
      followers: hit.followers,
      sources: [source],
    })
  }
  const searched = current.searched.some((item) => item.toLowerCase() === label.toLowerCase())
    ? current.searched
    : done
      ? [...current.searched, label]
      : current.searched
  return { ...current, queue, seen: [...seen], searched, updatedAt: now }
}

export function markExpanded(job: SnowballJob, username: string, now = Date.now()): SnowballJob {
  const key = username.toLowerCase()
  if (job.expanded.includes(key)) return job
  return { ...job, expanded: [...job.expanded, key], updatedAt: now }
}

export function progressLabel(job: SnowballJob): string {
  const keywords = job.keywords ?? []
  const searched = job.searched ?? []
  const head = job.phase === 'search' ? `Search ${searched.length}/${keywords.length}` : `Depth ${job.depth}`
  const note = job.searchNote ? ` · ${job.searchNote}` : ''
  return `${head} · ${countStrong(job)}/${job.settings.targetStrong} STRONG · ${job.scoredToday}/${job.settings.dailyCap} today${note}`
}

function roundRate(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 10_000) / 100
}

export function snowballAccountTable(accounts: ScoredAccount[]): (string | number | null)[][] {
  const headers = ['Account', 'Grade', 'Depth', 'Median views', 'Reels at 3× unpaid', 'Engagement rate (%)', 'Followers', 'Reels loaded', 'Provenance']
  const rank = { STRONG: 0, MAYBE: 1, WEAK: 2, ERROR: 3 }
  const ordered = [...accounts].sort((a, b) => rank[a.grade] - rank[b.grade] || a.depth - b.depth || a.username.localeCompare(b.username))
  return [
    headers,
    ...ordered.map((account) => [
      account.username,
      account.grade,
      account.depth,
      account.medianViews,
      account.breakouts,
      roundRate(account.engagementRate),
      account.followers,
      account.loaded,
      account.provenance,
    ]),
  ]
}

export function snowballQueueTable(queue: QueueItem[]): (string | number | null)[][] {
  const headers = ['Account', 'Depth', 'Strong mentions', 'Followers', 'Provenance']
  const ordered = [...queue].sort((a, b) => a.depth - b.depth || b.score - a.score || a.username.localeCompare(b.username))
  return [
    headers,
    ...ordered.map((item) => [item.username, item.depth, item.score, item.followers, provenanceText(item.sources)]),
  ]
}

export function snowballCsv(accounts: ScoredAccount[]): string {
  return tableToCsv(snowballAccountTable(accounts))
}
