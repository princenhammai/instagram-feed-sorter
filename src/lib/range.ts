import { dateFilterAllowed, countAllAllowed, isSortable } from './surface'
import { SAFETY_CAP, type RangeChoice, type Surface } from './types'

export interface ResolvedRange {
  limit: number
  start?: number
  end?: number
}

const DAY = 24 * 60 * 60 * 1000

const PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 } as const

export function resolveRange(choice: RangeChoice, now = Date.now()): ResolvedRange {
  const limit = choice.count === 'all' ? SAFETY_CAP : choice.count
  if (choice.date === 'none' || choice.date === 'all') return { limit }
  if (choice.date === 'custom') return { limit, start: choice.start, end: choice.end }
  return { limit, start: now - PRESET_DAYS[choice.date] * DAY, end: now }
}

export function rangeError(surface: Surface, choice: RangeChoice): string | null {
  if (!isSortable(surface)) {
    return 'Open a profile, the Reels tab, an Explore search, or a Saved collection.'
  }
  if (typeof choice.count === 'number') {
    if (!Number.isInteger(choice.count) || choice.count < 1) return 'Enter how many posts to collect.'
    if (choice.count > SAFETY_CAP) return `Pick ${SAFETY_CAP.toLocaleString()} or fewer posts per sort.`
  } else if (choice.count === 'all') {
    if (!countAllAllowed(surface)) return 'All posts is not available on search. Pick a specific number.'
  } else {
    return 'Enter how many posts to collect.'
  }
  const dated = choice.date !== 'none' && choice.date !== 'all'
  if (dated && !dateFilterAllowed(surface)) {
    return 'Date ranges are not available on this page. Pick a number of posts instead.'
  }
  if (choice.date === 'custom') {
    if (choice.start == null || choice.end == null) return 'Choose a start and end date.'
    if (choice.start > choice.end) return 'The start date needs to be before the end date.'
  }
  return null
}
