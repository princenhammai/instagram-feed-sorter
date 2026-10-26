import type { Post } from './types'

export type MetricKey = 'views' | 'likes' | 'comments'
export type TimeUnit = 'days' | 'weeks' | 'months' | 'years'

export type PostedFilter =
  | { mode: 'none' }
  | { mode: 'last'; amount: number; unit: TimeUnit }
  | { mode: 'between'; start: number | null; end: number | null }

export interface FilterState {
  metric: MetricKey | null
  min: number | null
  max: number | null
  posted: PostedFilter
}

export const EMPTY_FILTERS: FilterState = {
  metric: null,
  min: null,
  max: null,
  posted: { mode: 'none' },
}

const UNIT_MS: Record<TimeUnit, number> = {
  days: 86_400_000,
  weeks: 7 * 86_400_000,
  months: 30 * 86_400_000,
  years: 365 * 86_400_000,
}

export function applyFilters(posts: Post[], filters: FilterState, now = Date.now()): Post[] {
  return posts.filter((post) => {
    if (filters.metric && (filters.min != null || filters.max != null)) {
      const value = post[filters.metric]
      if (value == null) return false
      if (filters.min != null && value < filters.min) return false
      if (filters.max != null && value > filters.max) return false
    }
    if (filters.posted.mode === 'last') {
      if (filters.posted.amount <= 0) return true
      if (!post.takenAt) return false
      return post.takenAt >= now - filters.posted.amount * UNIT_MS[filters.posted.unit]
    }
    if (filters.posted.mode === 'between') {
      if (!post.takenAt) return false
      if (filters.posted.start != null && post.takenAt < filters.posted.start) return false
      if (filters.posted.end != null && post.takenAt > filters.posted.end) return false
    }
    return true
  })
}

export function metricBounds(posts: Post[], metric: MetricKey): { min: number; max: number } | null {
  const values = posts.map((post) => post[metric]).filter((value): value is number => value != null)
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

export function filtersActive(filters: FilterState, posts: Post[]): boolean {
  if (filters.posted.mode !== 'none') return true
  if (!filters.metric || (filters.min == null && filters.max == null)) return false
  const bounds = metricBounds(posts, filters.metric)
  if (!bounds) return filters.min != null || filters.max != null
  const min = filters.min ?? bounds.min
  const max = filters.max ?? bounds.max
  return min > bounds.min || max < bounds.max
}

export interface HistogramBin {
  from: number
  to: number
  count: number
}

export function histogram(values: number[], bins = 12): HistogramBin[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [{ from: min, to: max, count: values.length }]
  const width = (max - min) / bins
  const buckets: HistogramBin[] = Array.from({ length: bins }, (_, index) => ({
    from: min + index * width,
    to: index === bins - 1 ? max : min + (index + 1) * width,
    count: 0,
  }))
  for (const value of values) {
    let index = Math.floor((value - min) / width)
    if (index >= bins) index = bins - 1
    if (index < 0) index = 0
    buckets[index].count += 1
  }
  return buckets
}
