import { describe, expect, it } from 'vitest'
import { applyAccountOutcome, createJob, isRateLimited, scoreAccount, uniquePosts } from '../batch'
import { httpFailureMessage, responseSnippet } from './page-data'
import { withResearch } from '../research'
import { extractFollowerCounts, extractItems, extractNext, extractUsers } from './extract'
import { clipsPage, clipsPageEnd, followingPage, privateBody, profileSuggestions, rateLimitBody } from './fixtures'
import { normalizeMedia } from './normalize'
import type { Post } from '../types'

function postsFrom(payload: unknown, username: string): Post[] {
  return extractItems(payload)
    .map((item) => normalizeMedia(item, username))
    .filter((post): post is Post => post != null)
}

describe('instagram response fixtures', () => {
  it('reads a clips page, the next cursor, and drops a repeated shortcode', () => {
    expect(extractNext(clipsPage)).toBe('QVFB_page2')
    expect(extractNext(clipsPageEnd)).toBeUndefined()
    const posts = uniquePosts([...postsFrom(clipsPage, 'omgadrian'), ...postsFrom(clipsPageEnd, 'omgadrian')])
    expect(posts.map((post) => post.shortcode)).toEqual(['C0AbCdEfGhI', 'C0PaidReel1', 'C0Quiet01'])
    const first = posts[0]
    expect(first?.views).toBe(980112)
    expect(first?.likes).toBe(12034)
    expect(first?.duration).toBe(14.2)
    expect(first?.audio).toBe('Night Drive — Ada')
    expect(first?.videoUrl).toContain('reel.mp4')
    expect(first?.username).toBe('omgadrian')
    const scored = withResearch(posts)
    const paid = scored.find((post) => post.shortcode === 'C0PaidReel1')
    expect(paid?.paidPartnership).toBe(true)
    expect(paid?.likelyPaid).toBe(true)
    expect(paid?.paidSignals).toEqual(expect.arrayContaining(['#ad', '#sponsored', 'paid partnership']))
    expect(paid?.medianScore).toBeGreaterThan(1)
  })

  it('reads suggested accounts and a following page', () => {
    const suggested = extractUsers(profileSuggestions, false)
    expect(suggested.map((account) => account.username)).toEqual(['studio.north'])
    expect(suggested[0]?.followers).toBe(5400)
    expect(extractFollowerCounts(profileSuggestions).get('omgadrian')).toBe(120034)
    expect(extractNext(followingPage)).toBe('12')
    const following = extractUsers(followingPage)
    expect(following.map((account) => account.username)).toEqual(['cara.films', 'studio.north'])
    expect(following[0]?.followers).toBe(3200)
    expect(following[1]?.isPrivate).toBe(true)
  })

  it('turns a mocked profile, a rate limit, and a private error into batch decisions', () => {
    const posts = uniquePosts(postsFrom(clipsPage, 'omgadrian'))
    const job = createJob(['omgadrian', 'bob'], 50, 800, 10)
    const saved = applyAccountOutcome(job, 'omgadrian', { followers: 120034, posts }, new Set(), 10)
    expect(saved.type).toBe('saved')
    if (saved.type !== 'saved') return
    expect(saved.job.index).toBe(1)
    expect(saved.job.accounts[0]?.reels).toHaveLength(2)
    const scored = scoreAccount(saved.job.accounts[0]?.reels ?? [], 120034)
    expect(scored.find((post) => post.shortcode === 'C0PaidReel1')?.likelyPaid).toBe(true)

    expect(isRateLimited(rateLimitBody.message)).toBe(true)
    expect(isRateLimited(String(rateLimitBody.feedback_title))).toBe(true)
    const http429 = httpFailureMessage(429, JSON.stringify(rateLimitBody))
    expect(http429).toBe('HTTP 429 from Instagram. Please wait a few minutes before you try again. Try Again Later')
    expect(isRateLimited(http429, 429)).toBe(true)
    expect(isRateLimited('user id 4290012345 loaded 12 reels')).toBe(false)
    expect(isRateLimited(`${'x'.repeat(230)} try again later`)).toBe(false)
    expect(responseSnippet('<!doctype html><html>try again later</html>')).toBe('Instagram returned HTML instead of JSON.')
    const paused = applyAccountOutcome(saved.job, 'bob', { followers: null, posts: [], thrown: http429 }, new Set(), 11)
    expect(paused.type).toBe('pause')
    expect(paused.job.index).toBe(1)
    expect(paused.job.note).toContain('HTTP 429')
    const limited = applyAccountOutcome(saved.job, 'bob', { followers: null, posts: [], thrown: rateLimitBody.message }, new Set(), 11)
    expect(limited.type).toBe('pause')
    expect(limited.job.index).toBe(1)
    expect(limited.job.status).toBe('paused')
    expect(limited.job.accounts).toHaveLength(1)

    const denied = applyAccountOutcome(
      { ...limited.job, status: 'running' },
      'bob',
      { followers: null, posts: [], thrown: privateBody.message },
      new Set(),
      12,
    )
    expect(denied.type).toBe('saved')
    if (denied.type !== 'saved') return
    expect(denied.job.status).toBe('done')
    expect(denied.job.accounts[1]).toMatchObject({ username: 'bob', status: 'error', error: privateBody.message })
  })
})
