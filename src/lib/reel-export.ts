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
  'Rank',
  'Username',
  'Shortcode',
  'URL',
  'Views',
  'Likes',
  'Comments',
  'Posted date',
  'Caption',
  'Duration (s)',
  'Outlier score',
  'Is ad',
] as const

export interface ReelExportRecord {
  Rank: number
  Username: string
  Shortcode: string
  URL: string
  Views: number | null
  Likes: number | null
  Comments: number | null
  'Posted date': string
  Caption: string
  'Duration (s)': number | null
  'Outlier score': number | null
  'Is ad': boolean
}

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

export function outlierAgainstMedian(views: number | null, medianViews: number | null): number | null {
  if (views == null || !Number.isFinite(views) || medianViews == null || !Number.isFinite(medianViews) || medianViews <= 0) return null
  return round(views / medianViews, 2)
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

function round(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function postedDate(ms: number): string {
  if (!ms) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function captionOf(caption: string): string {
  return caption.trim().slice(0, 200)
}

/** Stops Excel and Sheets from treating a caption as a formula. */
export function sheetSafeText(value: string): string {
  return /^[=+@-]/.test(value) ? `'${value}` : value
}

function csvCell(value: string | number | null): string {
  if (value == null) return ''
  const text = typeof value === 'number' ? String(value) : value
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function tsvCell(value: string | number | null): string {
  if (value == null) return ''
  const text = typeof value === 'number' ? String(value) : value
  if (/["\t\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function textNumber(value: number | null, digits: number): string {
  if (value == null || !Number.isFinite(value)) return ''
  return value.toFixed(digits)
}

export function reelExportStem(username: string, now: Date): string {
  const safe = username.trim().replace(/^@+/, '').replace(/[^A-Za-z0-9._-]/g, '') || 'profile'
  const pad = (value: number) => String(value).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `${safe}-reels-${day}`
}

export interface ReelExportFile {
  headers: readonly string[]
  records: ReelExportRecord[]
  /** Spreadsheet rows: numbers stay numbers, captions are formula-safe. */
  sheet: (string | number | null)[][]
  csv: string
  tsv: string
  json: string
  filename: string
  rows: number
}

/** Rows stay in the order given. Ads are omitted unless includeAds is set. */
export function buildReelExport(posts: readonly ExportReel[], options: { includeAds: boolean; username: string; now: Date }): ReelExportFile {
  const medians = accountMedianViews(posts)
  const chosen = options.includeAds ? posts : posts.filter((post) => !reelIsAd(post))
  const records: ReelExportRecord[] = chosen.map((post, index) => {
    const medianViews = medians.get(post.username.toLowerCase()) ?? null
    const duration = post.duration == null || !Number.isFinite(post.duration) ? null : round(post.duration, 1)
    return {
      Rank: index + 1,
      Username: post.username,
      Shortcode: post.shortcode,
      URL: `https://www.instagram.com/reel/${post.shortcode}/`,
      Views: post.views,
      Likes: post.likes,
      Comments: post.comments,
      'Posted date': postedDate(post.takenAt),
      Caption: captionOf(post.caption),
      'Duration (s)': duration,
      'Outlier score': outlierAgainstMedian(post.views, medianViews),
      'Is ad': reelIsAd(post),
    }
  })
  const sheet: (string | number | null)[][] = [
    [...REEL_EXPORT_HEADERS],
    ...records.map((record) => [
      record.Rank,
      record.Username,
      record.Shortcode,
      record.URL,
      record.Views,
      record.Likes,
      record.Comments,
      record['Posted date'],
      sheetSafeText(record.Caption),
      record['Duration (s)'],
      record['Outlier score'],
      record['Is ad'] ? 'Yes' : 'No',
    ]),
  ]
  const csvBody = records.map((record) => [
    record.Rank,
    record.Username,
    record.Shortcode,
    record.URL,
    record.Views ?? '',
    record.Likes ?? '',
    record.Comments ?? '',
    record['Posted date'],
      sheetSafeText(record.Caption),
      record['Duration (s)'] ?? '',
      textNumber(record['Outlier score'], 2),
    record['Is ad'] ? 'Yes' : 'No',
  ])
  const csvTable = [[...REEL_EXPORT_HEADERS], ...csvBody]
  const csv = `\uFEFF${csvTable.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const tsv = csvTable.map((row) => row.map((value) => tsvCell(value == null ? '' : value)).join('\t')).join('\n')
  const json = `${JSON.stringify(records, null, 2)}\n`
  const stem = reelExportStem(options.username, options.now)
  return { headers: REEL_EXPORT_HEADERS, records, sheet, csv, tsv, json, filename: `${stem}.csv`, rows: records.length }
}
