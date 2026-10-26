import { exportColumns, formatExportDate } from './export'
import { rangeError } from './range'
import { isSortable, parseSurface, sortBlockReason } from './surface'
import { SAFETY_CAP, type DatePreset, type Post, type RangeChoice, type SortableSurface, type SortKey } from './types'

export const BRIDGE_PORT = 47331
export const BRIDGE_HOST = '127.0.0.1'

export const AGENT_SORTS = [
  'views',
  'likes',
  'comments',
  'outlier',
  'engagement',
  'duration',
  'median',
  'likeRate',
  'commentRate',
  'newest',
  'oldest',
] as const
export const AGENT_SINCE = ['none', '7d', '30d', '90d', '180d', '365d'] as const
export const AGENT_FORMATS = ['none', 'csv', 'json', 'sheets', 'excel'] as const

export type AgentFormat = (typeof AGENT_FORMATS)[number]

export interface AgentTarget {
  url: string
  label: string
  surface: SortableSurface
}

export interface PreparedSort {
  targets: AgentTarget[]
  range: RangeChoice
  sortKey: SortKey
  show: number
  format: AgentFormat
}

export interface AgentRow {
  rank: number
  username: string
  permalink: string
  caption: string
  published: string
  views: number | null
  likes: number | null
  comments: number | null
  durationSeconds: number | null
  outlierScore: number | null
  engagementPercent: number | null
  medianMultiple: number | null
  likeRatePercent: number | null
  commentRatePercent: number | null
  audio: string | null
  likelyPaid: boolean
  mediaKind: Post['mediaKind']
}

const USERNAME = /^[A-Za-z0-9._]{1,30}$/
const MAX_PROFILES = 4

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanUsername(value: string): string | null {
  const name = value.trim().replace(/^@+/, '')
  return USERNAME.test(name) ? name : null
}

function sectionOf(value: unknown): 'reels' | 'posts' {
  return value === 'posts' ? 'posts' : 'reels'
}

function profileTarget(username: string, section: 'reels' | 'posts'): AgentTarget {
  const surface: SortableSurface = section === 'reels' ? { kind: 'reels', username } : { kind: 'posts', username }
  const url =
    section === 'reels'
      ? `https://www.instagram.com/${encodeURIComponent(username)}/reels/`
      : `https://www.instagram.com/${encodeURIComponent(username)}/`
  return { url, label: `${username} ${section}`, surface }
}

function targetFromUrl(raw: string): AgentTarget | { error: string } {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { error: `“${raw}” is not an Instagram profile or collection link.` }
  }
  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'www.instagram.com' && parsed.hostname !== 'instagram.com')) {
    return { error: 'Only instagram.com links can be sorted.' }
  }
  parsed.protocol = 'https:'
  parsed.hostname = 'www.instagram.com'
  parsed.hash = ''
  const surface = parseSurface(parsed.toString())
  if (!isSortable(surface)) return { error: 'That Instagram link is not a profile, Reels tab, search, or saved collection.' }
  return { url: parsed.toString(), label: targetLabel(surface), surface }
}

function targetLabel(surface: SortableSurface): string {
  switch (surface.kind) {
    case 'reels':
      return `${surface.username} reels`
    case 'posts':
      return `${surface.username} posts`
    case 'explore-search':
      return surface.query
    case 'saved-all':
      return `${surface.username} saved`
    case 'saved-collection':
      return surface.slug.replace(/-/g, ' ')
  }
}

function defaultSort(surface: SortableSurface): SortKey {
  return surface.kind === 'reels' ? 'views' : 'likes'
}

export function sortTimeoutMs(count: number | 'all'): number {
  if (count === 'all') return 12 * 60_000
  return Math.min(8 * 60_000, 45_000 + count * 1500)
}

export function jobBudgetMs(prepared: PreparedSort): number {
  return prepared.targets.length * sortTimeoutMs(prepared.range.count) + prepared.targets.length * 4_000 + 20_000
}

export function prepareSort(input: unknown): PreparedSort | { error: string } {
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const section = sectionOf(body.section)
  const saved = body.saved === true
  const query = text(body.query)
  const collectionUrl = text(body.collectionUrl)
  const format = AGENT_FORMATS.includes(body.export as AgentFormat) ? (body.export as AgentFormat) : 'none'
  const since = AGENT_SINCE.includes(body.since as (typeof AGENT_SINCE)[number]) ? (body.since as DatePreset) : 'none'
  const show = typeof body.show === 'number' && Number.isInteger(body.show) ? Math.min(40, Math.max(1, body.show)) : 10
  const all = body.all === true
  let count: number | 'all' = 25
  if (all) count = 'all'
  else if (typeof body.count === 'number' && Number.isFinite(body.count)) count = Math.round(body.count)
  else if (typeof body.count === 'string' && /^\d+$/.test(body.count.trim())) count = Number(body.count.trim())

  if (count !== 'all' && (!Number.isInteger(count) || count < 1 || count > SAFETY_CAP)) {
    return { error: `Ask for between 1 and ${SAFETY_CAP.toLocaleString()} posts, or all of them.` }
  }

  const listed = Array.isArray(body.usernames)
    ? body.usernames
    : typeof body.usernames === 'string'
      ? body.usernames.split(/[\s,]+/)
      : body.username != null
        ? [body.username]
        : []
  const rawNames = listed.map((item) => text(item)).filter(Boolean)
  if (query && (rawNames.length > 0 || saved || collectionUrl)) {
    return { error: 'Search is separate from a profile or a saved collection. Ask for one of them.' }
  }
  if (saved && collectionUrl) return { error: 'Ask for all saved posts or one collection, not both.' }
  if (collectionUrl && rawNames.length > 0) return { error: 'Pass the collection link on its own.' }

  const targets: AgentTarget[] = []
  if (collectionUrl) {
    const target = targetFromUrl(collectionUrl)
    if ('error' in target) return target
    targets.push(target)
  } else if (query) {
    if (query.length > 150) return { error: 'That search is too long.' }
    const url = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`
    targets.push({ url, label: query, surface: { kind: 'explore-search', query } })
  } else if (rawNames.length === 0) {
    return { error: 'Name a profile, a search, or a saved collection.' }
  } else {
    if (rawNames.length > MAX_PROFILES) return { error: `Sort up to ${MAX_PROFILES} profiles in one request.` }
    if (all && rawNames.length > 1) return { error: 'Collecting an entire profile is one account at a time.' }
    const seen = new Set<string>()
    for (const raw of rawNames) {
      if (/^https?:\/\//i.test(raw)) {
        const target = targetFromUrl(raw)
        if ('error' in target) return target
        targets.push(target)
        continue
      }
      const username = cleanUsername(raw)
      if (!username) return { error: `“${raw}” is not an Instagram username.` }
      const key = username.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      if (saved) {
        targets.push({
          url: `https://www.instagram.com/${encodeURIComponent(username)}/saved/all-posts/`,
          label: `${username} saved`,
          surface: { kind: 'saved-all', username },
        })
      } else {
        targets.push(profileTarget(username, section))
      }
    }
  }

  if (targets.length === 0) return { error: 'Name a profile, a search, or a saved collection.' }

  const sortKey = AGENT_SORTS.includes(body.sort as SortKey) ? (body.sort as SortKey) : defaultSort(targets[0].surface)
  if (sortKey === 'outlier' && targets.length !== 1) {
    return { error: 'Outlier score only works on one profile, where every post belongs to the same creator.' }
  }

  const range: RangeChoice = { count, date: since }
  for (const target of targets) {
    const blocked = sortBlockReason(target.surface, sortKey) || rangeError(target.surface, range)
    if (blocked) return { error: blocked }
  }

  return { targets, range, sortKey, show, format }
}

function round(value: number | null | undefined, digits: number): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

export function agentRows(posts: Post[], show: number): AgentRow[] {
  return posts.slice(0, show).map((post, index) => ({
    rank: index + 1,
    username: post.username,
    permalink: post.url,
    caption: post.caption.slice(0, 280),
    published: formatExportDate(post.takenAt),
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    durationSeconds: round(post.duration, 1),
    outlierScore: round(post.outlierScore, 2),
    engagementPercent: round(post.engagementRate == null ? null : post.engagementRate * 100, 2),
    medianMultiple: round(post.medianScore, 2),
    likeRatePercent: round(post.likeRate == null ? null : post.likeRate * 100, 2),
    commentRatePercent: round(post.commentRate == null ? null : post.commentRate * 100, 2),
    audio: post.audio ?? null,
    likelyPaid: Boolean(post.likelyPaid),
    mediaKind: post.mediaKind,
  }))
}

export function recordsFromPosts(posts: Post[]): Record<string, string | number | null>[] {
  const columns = exportColumns()
  return posts.map((post) => {
    const record: Record<string, string | number | null> = {}
    for (const column of columns) record[column.header] = column.value(post)
    return record
  })
}
