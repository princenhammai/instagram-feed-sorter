import { describe, expect, it } from 'vitest'
import { applyFilters, EMPTY_FILTERS, histogram } from './filters'
import { boltTiers, computeOutlierScores, engagementRate, withEngagement } from './outlier'
import { searchPosts, sortPosts } from './sort'
import { exportColumns, toCsv, toTsv } from './export'
import { parseGoogleJson, sheetUploadBody, spreadsheetUrl } from './sheets'
import { samplePost } from './sample'
import type { Post } from './types'

const now = Date.UTC(2026, 9, 26)

function daysAgo(days: number, extra: Partial<Post> = {}): Post {
  return samplePost({ takenAt: now - days * 86_400_000, ...extra })
}

describe('outlier score', () => {
  it('uses the account average of up to 25 posts older than three days', () => {
    const recent = daysAgo(1, { id: 'new', views: 9000 })
    const low = daysAgo(10, { id: 'low', views: 100 })
    const mid = daysAgo(15, { id: 'mid', views: 200 })
    const high = daysAgo(20, { id: 'high', views: 600 })
    const scores = computeOutlierScores([recent, low, mid, high], 'views', now)
    expect(scores.get('low')).toBe(0.3333333333333333)
    expect(scores.get('high')).toBe(2)
    expect(scores.get('new')).toBe(30)
  })

  it('ignores a breakout outside the newest 25 when building the baseline', () => {
    const recent = Array.from({ length: 25 }, (_, index) =>
      daysAgo(10 + index, { id: `r${index}`, views: 10 }),
    )
    const ancient = daysAgo(400, { id: 'old', views: 10_000 })
    const scores = computeOutlierScores([...recent, ancient], 'views', now)
    expect(scores.get('old')).toBe(1000)
    expect(scores.get('r0')).toBe(1)
  })

  it('leaves scores empty when every post is from the last three days', () => {
    const scores = computeOutlierScores([daysAgo(1, { id: 'a', views: 10 })], 'views', now)
    expect(scores.get('a')).toBeNull()
  })

  it('gives bolts only to posts at 2× or above, and only a handful', () => {
    const posts = [
      samplePost({ id: 'a', outlierScore: 8 }),
      samplePost({ id: 'b', outlierScore: 4 }),
      samplePost({ id: 'c', outlierScore: 3 }),
      samplePost({ id: 'd', outlierScore: 2 }),
      samplePost({ id: 'e', outlierScore: 1.9 }),
    ]
    const tiers = boltTiers(posts)
    expect(tiers.get('a')).toBe(3)
    expect(tiers.get('b')).toBe(2)
    expect(tiers.get('d')).toBe(1)
    expect(tiers.has('e')).toBe(false)
  })
})

describe('sort and filters', () => {
  const posts = [
    samplePost({ id: 'a', views: 10, likes: 5, takenAt: 3 }),
    samplePost({ id: 'b', views: 50, likes: 1, takenAt: 2 }),
    samplePost({ id: 'c', views: null, likes: 9, takenAt: 1 }),
  ]

  it('ranks null metrics last', () => {
    expect(sortPosts(posts, 'views').map((post) => post.id)).toEqual(['b', 'a', 'c'])
    expect(sortPosts(posts, 'oldest').map((post) => post.id)).toEqual(['c', 'b', 'a'])
  })

  it('narrows by a minimum and a posted window', () => {
    const dated = [daysAgo(1, { id: 'new', views: 200 }), daysAgo(30, { id: 'old', views: 20 })]
    expect(applyFilters(dated, { ...EMPTY_FILTERS, metric: 'views', min: 100, max: null }, now).map((p) => p.id)).toEqual([
      'new',
    ])
    expect(
      applyFilters(dated, { ...EMPTY_FILTERS, posted: { mode: 'last', amount: 7, unit: 'days' } }, now).map((p) => p.id),
    ).toEqual(['new'])
    expect(applyFilters(dated, EMPTY_FILTERS, now)).toHaveLength(2)
  })

  it('builds a histogram', () => {
    const bins = histogram([1, 1, 2, 2])
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(4)
  })
})

describe('engagement rate', () => {
  it('divides interactions by views, then by followers when there are no views', () => {
    expect(engagementRate(samplePost({ likes: 8, comments: 2, views: 100 }), 5000)).toBe(0.1)
    expect(engagementRate(samplePost({ likes: 8, comments: 2, views: null }), 1000)).toBe(0.01)
    expect(engagementRate(samplePost({ likes: 8, comments: 2, views: null }), null)).toBeNull()
  })

  it('sorts by engagement and newest', () => {
    const posts = withEngagement(
      [
        samplePost({ id: 'a', likes: 1, comments: 0, views: 100, takenAt: 1 }),
        samplePost({ id: 'b', likes: 50, comments: 0, views: 100, takenAt: 2 }),
      ],
      null,
    )
    expect(sortPosts(posts, 'engagement').map((post) => post.id)).toEqual(['b', 'a'])
    expect(sortPosts(posts, 'newest').map((post) => post.id)).toEqual(['b', 'a'])
  })

  it('searches captions with every term', () => {
    const posts = [samplePost({ id: 'a', caption: 'Morning gym routine' }), samplePost({ id: 'b', caption: 'Pasta night' })]
    expect(searchPosts(posts, 'gym morning').map((post) => post.id)).toEqual(['a'])
    expect(searchPosts(posts, '  ')).toHaveLength(2)
  })
})

describe('export columns', () => {
  it('includes every requested field', () => {
    const headers = exportColumns().map((column) => column.header)
    for (const header of [
      'Thumbnail URL',
      'Caption',
      'Views',
      'Likes',
      'Comments',
      'Published date',
      'Permalink',
      'Media URL',
      'Duration (s)',
      'Engagement rate (%)',
      'Outlier score',
    ]) {
      expect(headers).toContain(header)
    }
  })

  it('quotes captions that contain commas', () => {
    const csv = toCsv(exportColumns(), [samplePost({ caption: 'hello, world' })])
    expect(csv).toContain('"hello, world"')
  })

  it('builds a spreadsheet upload that contains the row values', () => {
    const csv = toCsv(exportColumns(), [samplePost({ views: 94000, caption: 'bench day' })])
    const body = sheetUploadBody('Reels', csv, 'bound')
    expect(body).toContain('94000')
    expect(body).toContain('bench day')
    expect(body).toContain('text/csv')
    expect(spreadsheetUrl(parseGoogleJson(")]}'\n{\"id\":\"abc\"}"))).toBe(
      'https://docs.google.com/spreadsheets/d/abc/edit',
    )
  })

  it('keeps spreadsheet paste from running captions as formulas', () => {
    const tsv = toTsv(exportColumns(), [samplePost({ caption: '=HYPERLINK("x")' })])
    expect(tsv).toContain(`'=HYPERLINK`)
  })
})
