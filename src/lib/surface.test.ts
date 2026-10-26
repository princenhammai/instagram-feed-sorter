import { describe, expect, it } from 'vitest'
import { headline } from './headline'
import { parseSurface, allowedSorts, dateFilterAllowed, countAllAllowed, sortBlockReason } from './surface'
import { rangeError, resolveRange } from './range'
import { SAFETY_CAP, type RangeChoice } from './types'

const reels = parseSurface('https://www.instagram.com/creator/reels/')
const posts = parseSurface('https://www.instagram.com/creator/')
const search = parseSurface('https://www.instagram.com/explore/search/keyword/?q=cats')
const savedAll = parseSurface('https://www.instagram.com/creator/saved/all-posts/')
const saved = parseSurface('https://www.instagram.com/creator/saved/trip-ideas/9988/')

describe('parseSurface', () => {
  it('recognizes the sortable Instagram pages', () => {
    expect(reels).toEqual({ kind: 'reels', username: 'creator' })
    expect(posts).toEqual({ kind: 'posts', username: 'creator' })
    expect(search).toEqual({ kind: 'explore-search', query: 'cats' })
    expect(parseSurface('https://www.instagram.com/explore/tags/cats/')).toEqual({
      kind: 'explore-search',
      query: 'cats',
    })
    expect(savedAll).toEqual({ kind: 'saved-all', username: 'creator' })
    expect(saved).toEqual({
      kind: 'saved-collection',
      username: 'creator',
      slug: 'trip-ideas',
      collectionId: '9988',
    })
  })

  it('treats permalinks, stories, and the home feed as not sortable', () => {
    expect(parseSurface('https://www.instagram.com/reel/AbC123/').kind).toBe('post')
    expect(parseSurface('https://www.instagram.com/p/AbC123/').kind).toBe('post')
    expect(parseSurface('https://www.instagram.com/stories/creator/55/')).toMatchObject({
      kind: 'stories',
      username: 'creator',
      storyId: '55',
    })
    expect(parseSurface('https://www.instagram.com/').kind).toBe('other')
    expect(parseSurface('https://www.instagram.com/reels/').kind).toBe('other')
    expect(parseSurface('https://www.instagram.com/explore/search/keyword/').kind).toBe('other')
    expect(parseSurface('https://example.com/creator/').kind).toBe('other')
  })
})

describe('sort limits', () => {
  it('offers every sort, with outlier only on a single profile', () => {
    expect(allowedSorts(reels)).toEqual([
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
    ])
    expect(allowedSorts(posts)).toContain('views')
    expect(allowedSorts(search)).not.toContain('outlier')
    expect(allowedSorts(savedAll)).toContain('comments')
  })

  it('only blocks what the data cannot support', () => {
    expect(sortBlockReason(posts, 'views')).toBeNull()
    expect(sortBlockReason(search, 'outlier')).toMatch(/one profile/)
    expect(dateFilterAllowed(reels)).toBe(true)
    expect(dateFilterAllowed(search)).toBe(false)
    expect(countAllAllowed(search)).toBe(true)
    expect(countAllAllowed(savedAll)).toBe(true)
  })
})

describe('range', () => {
  const base: RangeChoice = { count: 25, date: 'none' }

  it('rejects impossible sorts before any request', () => {
    expect(rangeError(search, { count: 'all', date: 'none' })).toBeNull()
    expect(rangeError(search, { count: 25, date: '7d' })).toMatch(/Date ranges/)
    expect(rangeError(posts, { count: 25, date: 'custom' })).toMatch(/start and end/)
    expect(rangeError(posts, { count: 25, date: 'custom', start: 20, end: 10 })).toMatch(/before/)
    expect(rangeError(posts, { count: SAFETY_CAP + 1, date: 'none' })).toMatch(/fewer/)
    expect(rangeError(reels, base)).toBeNull()
  })

  it('turns a week preset into a start time', () => {
    const now = Date.UTC(2026, 9, 26)
    const resolved = resolveRange({ count: 'all', date: '7d' }, now)
    expect(resolved.limit).toBe(SAFETY_CAP)
    expect(resolved.start).toBe(now - 7 * 86_400_000)
    expect(resolved.end).toBe(now)
  })
})

describe('headline', () => {
  it('names the count and the window', () => {
    expect(headline(reels, { count: 25, date: '7d' })).toBe('25 Reels from 1 week back')
    expect(headline(posts, { count: 50, date: 'none' })).toBe('50 Posts')
    expect(headline(search, { count: 25, date: 'none' })).toBe('25 posts for “cats”')
  })
})
