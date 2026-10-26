import { describe, expect, it } from 'vitest'
import { createJob, currentHandle, parseHandles, pauseJob, resumeJob, scoreAccount, summarizeAccount, withAccount, batchReelTable, batchSummaryTable, compactReel } from './batch'
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
      compactReel(samplePost({ id: 'a', username: 'ada', views: 100, likes: 10, comments: 0, url: 'https://www.instagram.com/reel/a/' })),
      compactReel(samplePost({ id: 'b', username: 'ada', views: 300, likes: 30, comments: 0, url: 'https://www.instagram.com/reel/b/' })),
      compactReel(samplePost({ id: 'c', username: 'ada', views: 900, likes: 9, comments: 1, caption: 'hi #ad', url: 'https://www.instagram.com/reel/c/' })),
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
    expect(table[1][0]).toBe('ada')
    expect(batchSummaryTable([summary])[1]).toEqual(['ada', 3, 300, 'https://www.instagram.com/reel/c/', 900, 1, 1000, ''])
  })
})
