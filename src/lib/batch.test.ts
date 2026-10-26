import { describe, expect, it } from 'vitest'
import {
  accountGroups,
  applyAccountOutcome,
  batchFreshTable,
  batchReelTable,
  batchSummaryTable,
  compactReel,
  createJob,
  currentHandle,
  mergeSeen,
  parseHandles,
  pauseJob,
  resumeJob,
  scoreAccount,
  seenKeySet,
  summarizeAccount,
  summaryChartHtml,
  withAccount,
} from './batch'
import { samplePost } from './sample'

describe('batch handles', () => {
  it('reads handles from lines, commas, and profile urls', () => {
    const handles = parseHandles('@Ada, https://www.instagram.com/bob/reels/\nAda\nexplore\nnot a name!')
    expect(handles).toEqual(['Ada', 'bob'])
  })

  it('walks the list and can pause without losing the next account', () => {
    const job = createJob(['ada', 'bob'], 100, 500)
    expect(currentHandle(job)).toBe('ada')
    const saved = withAccount(job, { username: 'ada', status: 'done', followers: 10, reels: [] })
    expect(saved.index).toBe(1)
    expect(currentHandle(saved)).toBe('bob')
    const paused = pauseJob(saved, 'Instagram is rate limiting this account.')
    expect(currentHandle(paused)).toBeNull()
    expect(resumeJob(paused).status).toBe('running')
    expect(currentHandle(resumeJob(paused))).toBe('bob')
  })
})

describe('batch scores', () => {
  it('scores each account against its own median and counts 3x reels', () => {
    const reels = [
      compactReel(samplePost({ id: 'a', shortcode: 'a', username: 'ada', views: 100, likes: 10, comments: 0, url: 'https://www.instagram.com/reel/a/' })),
      compactReel(samplePost({ id: 'b', shortcode: 'b', username: 'ada', views: 300, likes: 30, comments: 0, url: 'https://www.instagram.com/reel/b/' })),
      compactReel(samplePost({ id: 'c', shortcode: 'c', username: 'ada', views: 900, likes: 9, comments: 1, caption: 'hi #ad', url: 'https://www.instagram.com/reel/c/' })),
    ]
    const posts = scoreAccount(reels, 1000)
    const summary = summarizeAccount('ada', posts, 1000)
    expect(summary.medianViews).toBe(300)
    expect(summary.atLeast3x).toBe(1)
    expect(summary.topPermalink).toContain('/reel/c/')
    expect(posts.find((post) => post.id === 'c')?.likelyPaid).toBe(true)
    const table = batchReelTable([{ posts, summary }])
    expect(table[0][0]).toBe('Account')
    expect(table[0].filter((header) => header === 'Duration (s)')).toHaveLength(1)
    expect(table[0]).toContain('Hook')
    expect(table[0]).toContain('Seen before')
    expect(table[1][0]).toBe('ada')
    expect(batchSummaryTable([summary])[1]).toEqual(['ada', 3, 300, 'https://www.instagram.com/reel/c/', 900, 1, 1000, 3, 0, ''])
    expect(summaryChartHtml([summary])).toContain('<svg')
    expect(summaryChartHtml([{ ...summary, username: '<ada>' }])).toContain('&lt;ada&gt;')
  })

  it('drops a repeated shortcode before scoring the median', () => {
    const reel = compactReel(samplePost({ id: 'a', shortcode: 'same', username: 'ada', views: 100, likes: 10 }))
    const repeat = compactReel(samplePost({ id: 'b', shortcode: 'same', username: 'ada', views: 900, likes: 9 }))
    const posts = scoreAccount([reel, repeat], 1000)
    expect(posts).toHaveLength(1)
    expect(posts[0]?.views).toBe(100)
    expect(summarizeAccount('ada', posts, 1000).medianViews).toBe(100)
  })
})

describe('batch outcomes', () => {
  const ada = samplePost({ id: 'a', username: 'ada', shortcode: 'AbC', views: 100, likes: 10, comments: 1, caption: '#fyp\nSave this hook' })
  const bob = samplePost({ id: 'b', username: 'bob', shortcode: 'XyZ', views: 50, likes: 5, comments: 0 })

  it('pauses on a rate limit without advancing, then resumes the same account', () => {
    const job = createJob(['ada', 'bob'], 25, 400, 1)
    const saved = applyAccountOutcome(job, 'ada', { followers: 1000, posts: [ada] }, new Set(), 2)
    expect(saved.type).toBe('saved')
    if (saved.type !== 'saved') return
    expect(saved.job.index).toBe(1)
    expect(saved.job.accounts[0]?.reels[0]?.seenBefore).toBe(false)
    const limited = applyAccountOutcome(
      saved.job,
      'bob',
      { followers: 20, posts: [bob], interrupted: 'HTTP 429' },
      new Set(),
      3,
    )
    expect(limited.type).toBe('pause')
    expect(limited.job.index).toBe(1)
    expect(limited.job.accounts.map((account) => account.username)).toEqual(['ada'])
    expect(currentHandle(limited.job)).toBeNull()
    const resumed = resumeJob(limited.job, 4)
    expect(resumed.status).toBe('running')
    expect(currentHandle(resumed)).toBe('bob')
    const empty = applyAccountOutcome(resumed, 'bob', { followers: null, posts: [], interrupted: 'No reels came back. The account may be private.' }, new Set(), 5)
    expect(empty.type).toBe('saved')
    if (empty.type !== 'saved') return
    expect(empty.job.status).toBe('done')
    expect(empty.job.accounts[1]).toMatchObject({ status: 'error', reels: [] })
  })

  it('marks shortcodes from an earlier run and leaves them off the new-reels sheet', () => {
    const known = seenKeySet(mergeSeen([], [{ username: 'ada', shortcode: 'AbC', seenAt: 1 }]))
    const job = createJob(['ada'], 10, 400, 1)
    const saved = applyAccountOutcome(job, 'ada', { followers: 10, posts: [ada, { ...ada, id: 'dup' }] }, known, 2)
    expect(saved.type).toBe('saved')
    if (saved.type !== 'saved') return
    expect(saved.job.accounts[0]?.reels).toHaveLength(1)
    expect(saved.job.accounts[0]?.reels[0]?.seenBefore).toBe(true)
    const groups = accountGroups(saved.job, 2)
    expect(groups[0]?.summary.fresh).toBe(0)
    expect(groups[0]?.summary.repeats).toBe(1)
    expect(batchFreshTable(groups)[1][1]).toContain('previous run')
    const again = mergeSeen(
      [{ username: 'ada', shortcode: 'AbC', seenAt: 1 }],
      [{ username: 'Ada', shortcode: 'AbC', seenAt: 9 }, { username: 'bob', shortcode: 'XyZ', seenAt: 9 }],
    )
    expect(again.map((item) => item.shortcode)).toEqual(['AbC', 'XyZ'])
    expect(again[0]?.seenAt).toBe(1)
  })
})
