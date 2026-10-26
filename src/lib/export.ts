import { captionHook } from './research'
import type { Post, SortableSurface } from './types'

export interface Column {
  header: string
  value: (post: Post) => string | number | null
}

function round(value: number | null | undefined, digits: number): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function mediaUrl(post: Post): string {
  if (post.videoUrl) return post.videoUrl
  if (post.slides.length > 0) return post.slides.map((slide) => slide.url).join(' ')
  return post.coverUrl ?? ''
}

export function exportColumns(): Column[] {
  return [
    { header: 'Username', value: (post) => post.username },
    { header: 'Type', value: (post) => post.mediaKind },
    { header: 'Permalink', value: (post) => post.url },
    { header: 'Published date', value: (post) => formatExportDate(post.takenAt) },
    { header: 'Caption', value: (post) => post.caption },
    { header: 'Hook', value: (post) => captionHook(post.caption) },
    { header: 'Views', value: (post) => post.views },
    { header: 'Likes', value: (post) => post.likes },
    { header: 'Comments', value: (post) => post.comments },
    { header: 'Duration (s)', value: (post) => round(post.duration, 1) },
    { header: 'Engagement rate (%)', value: (post) => round(post.engagementRate == null ? null : post.engagementRate * 100, 2) },
    { header: 'Outlier score', value: (post) => round(post.outlierScore, 2) },
    { header: 'Views × median', value: (post) => round(post.medianScore, 2) },
    { header: 'Likes / views (%)', value: (post) => round(post.likeRate == null ? null : post.likeRate * 100, 2) },
    { header: 'Comments / views (%)', value: (post) => round(post.commentRate == null ? null : post.commentRate * 100, 2) },
    { header: 'Audio', value: (post) => post.audio ?? '' },
    { header: 'Likely paid', value: (post) => (post.likelyPaid ? 'Yes' : 'No') },
    { header: 'Paid signals', value: (post) => (post.paidSignals && post.paidSignals.length > 0 ? post.paidSignals.join('; ') : '') },
    { header: 'Thumbnail URL', value: (post) => post.coverUrl ?? '' },
    { header: 'Media URL', value: mediaUrl },
  ]
}

export function formatExportDate(ms: number): string {
  if (!ms) return ''
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function table(columns: Column[], posts: Post[]): (string | number | null)[][] {
  return [columns.map((column) => column.header), ...posts.map((post) => columns.map((column) => column.value(post)))]
}

function cell(value: string | number | null): string {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n\r\t]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(columns: Column[], posts: Post[]): string {
  const lines = table(columns, posts).map((row) => row.map(cell).join(','))
  return `\uFEFF${lines.join('\r\n')}`
}

function tsvCell(value: string | number | null): string {
  if (value == null) return ''
  const text = String(value).replace(/[\t\r\n]+/g, ' ')
  return /^[=+@]|^-(?![\d.])/.test(text) ? `'${text}` : text
}

export function toTsv(columns: Column[], posts: Post[]): string {
  return table(columns, posts)
    .map((row) => row.map(tsvCell).join('\t'))
    .join('\n')
}

export function toJson(columns: Column[], posts: Post[]): string {
  const records = posts.map((post) => {
    const record: Record<string, string | number | null> = {}
    for (const column of columns) record[column.header] = column.value(post)
    return record
  })
  return JSON.stringify(records, null, 2)
}

export function objectsToTable(rows: Record<string, string | number | null>[]): (string | number | null)[][] {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ['Profile', 'Username', 'Full name', 'Verified']
  return [headers, ...rows.map((row) => headers.map((header) => row[header] ?? null))]
}

export function tableToTsv(rows: (string | number | null)[][]): string {
  return rows
    .map((row) => row.map((value) => (value == null ? '' : String(value).replace(/[\t\r\n]+/g, ' '))).join('\t'))
    .join('\n')
}

export function tableToCsv(rows: (string | number | null)[][]): string {
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`
}

export function tableToJson(rows: (string | number | null)[][]): string {
  const [headers, ...body] = rows
  if (!headers) return '[]'
  const records = body.map((row) => {
    const record: Record<string, string | number | null> = {}
    headers.forEach((header, index) => {
      record[String(header)] = row[index] ?? null
    })
    return record
  })
  return JSON.stringify(records, null, 2)
}

export function sortableName(surface: SortableSurface): string {
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
