import type { Post } from './types'

/** Flags already present on a captured reel. Export does not look anything else up. */
export type ReelAdFlags = {
  paidPartnership?: boolean | null
  is_paid_partnership?: boolean | null
  isPaidPartnership?: boolean | null
  ad?: boolean | null
  is_ad?: boolean | null
  isAd?: boolean | null
}

export type ExportReel = Post & ReelAdFlags

export const REEL_EXPORT_HEADERS = [
  'rank',
  'username',
  'shortcode',
  'url',
  'views',
  'likes',
  'comments',
  'posted_date',
  'caption',
  'duration_seconds',
  'outlier_score',
  'is_ad',
] as const

export function reelIsAd(post: ReelAdFlags): boolean {
  return Boolean(
    post.paidPartnership ||
      post.is_paid_partnership ||
      post.isPaidPartnership ||
      post.ad ||
      post.is_ad ||
      post.isAd,
  )
}

export function accountMedianViews(posts: readonly ExportReel[]): Map<string, number | null> {
  const grouped = new Map<string, number[]>()
  for (const post of posts) {
    if (post.views == null || !Number.isFinite(post.views)) continue
    const key = post.username.toLowerCase()
    const list = grouped.get(key)
    if (list) list.push(post.views)
    else grouped.set(key, [post.views])
  }
  const medians = new Map<string, number | null>()
  for (const [key, values] of grouped) medians.set(key, median(values))
  return medians
}

export function outlierAgainstMedian(views: number | null, medianViews: number | null): string {
  if (views == null || !Number.isFinite(views) || medianViews == null || !Number.isFinite(medianViews) || medianViews <= 0) return ''
  return (views / medianViews).toFixed(2)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? null
  const left = sorted[mid - 1]
  const right = sorted[mid]
  if (left == null || right == null) return null
  return (left + right) / 2
}

function postedDate(ms: number): string {
  if (!ms) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function captionOf(caption: string): string {
  return caption.slice(0, 200)
}

function csvCell(value: string | number | null): string {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function tsvCell(value: string | number | null): string {
  if (value == null) return ''
  const text = String(value)
  if (/["\t\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function reelExportFilename(username: string, now: Date): string {
  const safe = username.trim().replace(/^@+/, '').replace(/[^A-Za-z0-9._-]/g, '') || 'profile'
  const pad = (value: number) => String(value).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `${safe}-reels-${day}.csv`
}

export interface ReelExportFile {
  csv: string
  tsv: string
  filename: string
  rows: number
}

/** Rows stay in the order given. Ads are omitted unless includeAds is set. */
export function buildReelExport(posts: readonly ExportReel[], options: { includeAds: boolean; username: string; now: Date }): ReelExportFile {
  const medians = accountMedianViews(posts)
  const chosen = options.includeAds ? posts : posts.filter((post) => !reelIsAd(post))
  const body = chosen.map((post, index) => {
    const medianViews = medians.get(post.username.toLowerCase()) ?? null
    return [
      index + 1,
      post.username,
      post.shortcode,
      `https://www.instagram.com/reel/${post.shortcode}/`,
      post.views,
      post.likes,
      post.comments,
      postedDate(post.takenAt),
      captionOf(post.caption),
      post.duration ?? '',
      outlierAgainstMedian(post.views, medianViews),
      reelIsAd(post) ? 'true' : 'false',
    ]
  })
  const table = [REEL_EXPORT_HEADERS as unknown as (string | number | null)[], ...body]
  const csv = `\uFEFF${table.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const tsv = table.map((row) => row.map(tsvCell).join('\t')).join('\n')
  return { csv, tsv, filename: reelExportFilename(options.username, options.now), rows: body.length }
}
