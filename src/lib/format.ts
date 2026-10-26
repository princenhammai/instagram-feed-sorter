import type { Post, SortKey } from './types'

export function formatCount(value: number | null | undefined): string {
  if (value == null) return '—'
  const abs = Math.abs(value)
  if (abs < 1000) return String(Math.round(value))
  const units: [number, string][] = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1000, 'k'],
  ]
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = value / size
      const digits = Math.abs(scaled) >= 10 ? 0 : 1
      return `${scaled.toFixed(digits).replace(/\.0$/, '')}${suffix}`
    }
  }
  return String(value)
}

export function formatMultiple(score: number): string {
  const digits = Math.abs(score) >= 10 ? 0 : 1
  return `${score.toFixed(digits).replace(/\.0$/, '')}×`
}

export function formatDay(ms: number): string {
  if (!ms) return ''
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return '—'
  const percent = rate * 100
  return `${percent >= 10 ? percent.toFixed(1) : percent.toFixed(2)}%`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const whole = Math.round(seconds)
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

export function formatDateTime(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function cornerLabel(post: Post, sortKey: SortKey): string {
  if (sortKey === 'outlier') return post.outlierScore == null ? '—' : `⚡ ${formatMultiple(post.outlierScore)}`
  if (sortKey === 'median') return post.medianScore == null ? '—' : formatMultiple(post.medianScore)
  if (sortKey === 'likeRate') return formatPercent(post.likeRate)
  if (sortKey === 'commentRate') return formatPercent(post.commentRate)
  if (sortKey === 'comments') return `💬 ${formatCount(post.comments)}`
  if (sortKey === 'engagement') return `↗ ${formatPercent(post.engagementRate)}`
  if (sortKey === 'duration') return formatDuration(post.duration)
  if (sortKey === 'likes') return `♥ ${formatCount(post.likes)}`
  if (post.mediaKind !== 'image' && post.views != null) return `▶ ${formatCount(post.views)}`
  return `♥ ${formatCount(post.likes)}`
}

export function humanError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach Instagram. Refresh the page and make sure you are signed in.'
  }
  return message
}
