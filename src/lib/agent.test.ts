import { describe, expect, it } from 'vitest'
import { agentRows, jobBudgetMs, prepareSort } from './agent'
import { formatExportDate } from './export'
import type { Post } from './types'

const post: Post = {
  id: '1',
  shortcode: 'Ab',
  username: 'natgeo',
  url: 'https://www.instagram.com/reel/Ab/',
  caption: 'A field note',
  takenAt: Date.UTC(2026, 0, 2, 3, 4),
  likes: 10,
  comments: 2,
  views: 100,
  mediaKind: 'video',
  coverUrl: null,
  videoUrl: null,
  slides: [],
  duration: 12.24,
  outlierScore: 1.256,
  engagementRate: 0.12,
}

describe('prepareSort', () => {
  it('defaults a profile to 25 reels ranked by views', () => {
    const prepared = prepareSort({ usernames: ['@NatGeo'] })
    expect(prepared).toMatchObject({
      sortKey: 'views',
      range: { count: 25, date: 'none' },
      show: 10,
      format: 'none',
    })
    if ('error' in prepared) throw new Error(prepared.error)
    expect(prepared.targets[0]).toMatchObject({
      url: 'https://www.instagram.com/NatGeo/reels/',
      label: 'NatGeo reels',
    })
  })

  it('builds a search, a saved collection, and a posts tab', () => {
    const search = prepareSort({ query: 'tennis', sort: 'likes', count: 40 })
    if ('error' in search) throw new Error(search.error)
    expect(search.targets[0].url).toBe('https://www.instagram.com/explore/search/keyword/?q=tennis')
    expect(search.sortKey).toBe('likes')

    const saved = prepareSort({
      collectionUrl: 'https://instagram.com/me/saved/san-fran/9988/',
      sort: 'comments',
    })
    if ('error' in saved) throw new Error(saved.error)
    expect(saved.targets[0].surface).toMatchObject({ kind: 'saved-collection', collectionId: '9988' })

    const posts = prepareSort({ username: 'nasa', section: 'posts', since: '90d', all: true })
    if ('error' in posts) throw new Error(posts.error)
    expect(posts.targets[0].url).toBe('https://www.instagram.com/nasa/')
    expect(posts.range).toEqual({ count: 'all', date: '90d' })
    expect(posts.sortKey).toBe('likes')
  })

  it('refuses mixes that the sorter cannot run', () => {
    expect(prepareSort({ query: 'tennis', sort: 'outlier' })).toMatchObject({
      error: expect.stringContaining('Outlier'),
    })
    expect(prepareSort({ query: 'tennis', since: '30d' })).toMatchObject({
      error: expect.stringContaining('Date'),
    })
    expect(prepareSort({ usernames: ['a', 'b'], sort: 'outlier' })).toMatchObject({
      error: expect.stringContaining('one profile'),
    })
    expect(prepareSort({ usernames: ['one', 'two'], all: true })).toMatchObject({
      error: expect.stringContaining('one account'),
    })
    expect(prepareSort({})).toMatchObject({ error: expect.stringContaining('Name a profile') })
  })

  it('budgets longer waits for larger collections', () => {
    const small = prepareSort({ username: 'nasa', count: 25 })
    const large = prepareSort({ username: 'nasa', count: 200 })
    if ('error' in small || 'error' in large) throw new Error('expected a valid sort')
    expect(jobBudgetMs(large)).toBeGreaterThan(jobBudgetMs(small))
  })
})

describe('agentRows', () => {
  it('keeps a short ranked preview', () => {
    expect(agentRows([post], 10)).toEqual([
      expect.objectContaining({
        rank: 1,
        username: 'natgeo',
        views: 100,
        durationSeconds: 12.2,
        outlierScore: 1.26,
        engagementPercent: 12,
        published: formatExportDate(post.takenAt),
      }),
    ])
  })
})
