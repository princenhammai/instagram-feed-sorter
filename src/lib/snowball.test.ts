import { describe, expect, it } from 'vitest'
import { samplePost } from './sample'
import {
  applyCandidates,
  applyScore,
  applySearchCandidates,
  createSnowball,
  markExpanded,
  parseKeywords,
  pauseSnowball,
  plan,
  provenanceText,
  resumeSnowball,
  snowballAccountTable,
  type IncomingCandidate,
  type SearchHit,
  type SnowballJob,
} from './snowball'
import type { Post } from './types'

const DAY = Date.UTC(2026, 9, 26, 12)

function reel(username: string, id: string, views: number, likes = Math.round(views * 0.04), caption = ''): Post {
  return samplePost({
    id,
    shortcode: id,
    username,
    views,
    likes,
    comments: 2,
    caption,
    url: `https://www.instagram.com/reel/${id}/`,
  })
}

function strongPosts(username: string): Post[] {
  return [10_000, 10_000, 12_000, 40_000, 50_000].map((views, index) => reel(username, `${username}-s${index}`, views))
}

function weakPosts(username: string): Post[] {
  return [100, 150, 200].map((views, index) => reel(username, `${username}-w${index}`, views))
}

interface Node {
  followers: number | null
  posts: Post[]
  following?: IncomingCandidate[]
  suggested?: IncomingCandidate[]
}

function walk(start: SnowballJob, graph: Record<string, Node>, now = DAY, searches: Record<string, SearchHit[]> = {}): SnowballJob {
  let job = start
  for (let guard = 0; guard < 40 && job.status === 'running'; guard += 1) {
    const planned = plan(job, now)
    job = planned.job
    if (planned.step.type === 'search' && planned.step.keyword) {
      job = applySearchCandidates(job, planned.step.keyword, searches[planned.step.keyword] ?? [], now)
      continue
    }
    if (planned.step.type === 'score' && planned.step.username) {
      const node = graph[planned.step.username]
      job = applyScore(
        job,
        node
          ? { username: planned.step.username, followers: node.followers, posts: node.posts }
          : { username: planned.step.username, followers: null, posts: [], error: 'No fixture for that account.' },
        now,
      )
      continue
    }
    if (planned.step.type === 'expand' && planned.step.username) {
      const node = graph[planned.step.username]
      const incoming = [...(node?.following ?? []), ...(node?.suggested ?? [])]
      job = markExpanded(applyCandidates(job, planned.step.username, incoming, now), planned.step.username, now)
      continue
    }
    break
  }
  return job
}

describe('snowball graph', () => {
  const graph: Record<string, Node> = {
    ada: {
      followers: 80_000,
      posts: strongPosts('ada'),
      following: [
        { username: 'cara', followers: 20_000, via: 'following' },
        { username: 'dan', followers: 4_000, via: 'following' },
        { username: 'ada', followers: 80_000, via: 'following' },
        { username: 'bob', followers: 90_000, via: 'following' },
      ],
      suggested: [
        { username: 'cara', followers: 20_000, via: 'suggested' },
        { username: 'eve', followers: 15_000, via: 'suggested' },
      ],
    },
    bob: {
      followers: 90_000,
      posts: weakPosts('bob'),
      following: [{ username: 'zoe', followers: 30_000, via: 'following' }],
    },
    cara: { followers: 20_000, posts: strongPosts('cara'), following: [{ username: 'finn', followers: 12_000, via: 'following' }] },
    dan: { followers: 4_000, posts: weakPosts('dan') },
    eve: { followers: 15_000, posts: [reel('eve', 'eve-1', 8_000), reel('eve', 'eve-2', 9_000), reel('eve', 'eve-3', 40_000)] },
  }

  it('expands only strong accounts, dedupes seeds, and records provenance', () => {
    const finished = walk(createSnowball(['ada', 'bob', 'Ada'], { maxDepth: 1, targetStrong: 10, dailyCap: 20, minStrongRatio: 0.2 }, DAY), graph)
    expect(finished.status).toBe('done')
    expect(finished.accounts.map((account) => `${account.username}:${account.grade}`)).toEqual([
      'ada:STRONG',
      'bob:WEAK',
      'cara:STRONG',
      'dan:WEAK',
      'eve:MAYBE',
    ])
    const cara = finished.accounts.find((account) => account.username === 'cara')
    expect(cara?.provenance).toBe('followed by ada; suggested by ada')
    expect(cara?.depth).toBe(1)
    expect(cara?.medianViews).toBe(12_000)
    expect(cara?.breakouts).toBe(2)
    expect(finished.accounts.some((account) => account.username === 'zoe' || account.username === 'finn')).toBe(false)
    expect(finished.note).toBe('Reached max depth.')
  })

  it('scores a candidate mentioned by more strong accounts first', () => {
    const bothStrong: Record<string, Node> = {
      ada: { followers: 10, posts: strongPosts('ada'), following: [{ username: 'yve', followers: 10, via: 'following' }, { username: 'zoe', followers: 10, via: 'following' }] },
      bob: { followers: 10, posts: strongPosts('bob'), following: [{ username: 'zoe', followers: 10, via: 'following' }] },
      yve: { followers: 10, posts: weakPosts('yve') },
      zoe: { followers: 10, posts: weakPosts('zoe') },
    }
    const finished = walk(createSnowball(['ada', 'bob'], { maxDepth: 1, targetStrong: 10, minStrongRatio: 0 }, DAY), bothStrong)
    expect(finished.accounts.map((account) => account.username)).toEqual(['ada', 'bob', 'zoe', 'yve'])
    expect(finished.accounts.find((account) => account.username === 'zoe')?.provenance).toBe('followed by ada, bob')
  })

  it('stops when a round is under the strong ratio, before expanding', () => {
    const finished = walk(createSnowball(['ada', 'bob'], { minStrongRatio: 0.6, maxDepth: 3 }, DAY), graph)
    expect(finished.status).toBe('done')
    expect(finished.accounts.map((account) => account.username)).toEqual(['ada', 'bob'])
    expect(finished.note).toContain('under the cutoff')
    expect(finished.queue.every((item) => item.depth === 0)).toBe(true)
  })

  it('stops once the strong target is reached', () => {
    const finished = walk(createSnowball(['ada', 'bob'], { targetStrong: 1, maxDepth: 2 }, DAY), graph)
    expect(finished.accounts.map((account) => account.username)).toEqual(['ada'])
    expect(finished.note).toBe('Reached 1 STRONG account.')
  })

  it('drops candidates outside the follower range and keeps unknown counts', () => {
    const filtered: Record<string, Node> = {
      ada: {
        followers: 10,
        posts: strongPosts('ada'),
        following: [
          { username: 'tiny', followers: 10, via: 'following' },
          { username: 'fit', followers: 5_000, via: 'following' },
          { username: 'huge', followers: 500_000, via: 'following' },
          { username: 'quiet', followers: null, via: 'following' },
        ],
      },
      fit: { followers: 5_000, posts: weakPosts('fit') },
      quiet: { followers: null, posts: weakPosts('quiet') },
    }
    const finished = walk(
      createSnowball(['ada'], { minFollowers: 1_000, maxFollowers: 100_000, maxDepth: 1, minStrongRatio: 0 }, DAY),
      filtered,
    )
    expect(finished.accounts.map((account) => account.username)).toEqual(['ada', 'fit', 'quiet'])
  })

  it('does not count a paid breakout toward STRONG', () => {
    const posts = [
      reel('ada', 'a1', 10_000),
      reel('ada', 'a2', 10_000),
      reel('ada', 'a3', 12_000),
      reel('ada', 'a4', 50_000, 20_000, 'launch #ad'),
      reel('ada', 'organic', 40_000),
    ]
    const job = applyScore(createSnowball(['ada'], {}, DAY), { username: 'ada', followers: 1000, posts }, DAY)
    expect(job.accounts[0]).toMatchObject({ grade: 'MAYBE', breakouts: 1 })
  })

  it('requires the engagement floor before a STRONG mark', () => {
    const posts = strongPosts('ada').map((post) => ({ ...post, likes: 0, comments: 0 }))
    const job = applyScore(createSnowball(['ada'], { minEngagement: 0.01 }, DAY), { username: 'ada', followers: 1000, posts }, DAY)
    expect(job.accounts[0]?.grade).not.toBe('STRONG')
    expect(job.accounts[0]?.engagementRate).toBe(0)
  })

  it('pauses at the daily cap and resumes on the next UTC day', () => {
    let job = createSnowball(['ada', 'bob'], { dailyCap: 1, maxDepth: 0 }, DAY)
    job = applyScore(job, { username: 'ada', followers: 1, posts: strongPosts('ada') }, DAY)
    const capped = plan(job, DAY)
    expect(capped.step.type).toBe('pause')
    expect(capped.job.status).toBe('paused')
    expect(capped.job.queue.map((item) => item.username)).toEqual(['bob'])
    const sameDay = plan(resumeSnowball(capped.job, DAY + 60_000), DAY + 60_000)
    expect(sameDay.step.type).toBe('pause')
    const nextDay = plan(resumeSnowball(capped.job, DAY + 86_400_000), DAY + 86_400_000)
    expect(nextDay.step).toMatchObject({ type: 'score', username: 'bob' })
    expect(nextDay.job.scoredToday).toBe(0)
  })

  it('keeps a paused queue so a reload can resume the same account', () => {
    const job = pauseSnowball(createSnowball(['ada', 'bob'], {}, DAY), 'Instagram is rate limiting this account.', DAY)
    expect(plan(job, DAY).step.type).toBe('pause')
    const resumed = plan(resumeSnowball(job, DAY + 1000), DAY + 1000)
    expect(resumed.step).toMatchObject({ type: 'score', username: 'ada', depth: 0 })
    expect(resumed.job.accounts).toEqual([])
  })

  it('adds keyword accounts at round 0, dedupes seeds, and expands a strong one', () => {
    const searches: Record<string, SearchHit[]> = {
      barber: [
        { username: 'ada', followers: 80_000 },
        { username: 'fade.room', followers: 5_000 },
        { username: 'tiny', followers: 10 },
      ],
      fade: [
        { username: 'fade.room', followers: 5_000 },
        { username: 'other.shop', followers: 8_000 },
      ],
    }
    const deduped = applySearchCandidates(
      createSnowball(['ada'], {}, DAY, ['barber']),
      'barber',
      searches.barber ?? [],
      DAY,
    )
    expect(deduped.queue.map((item) => item.username)).toEqual(['ada', 'fade.room', 'tiny'])
    expect(deduped.queue[0]?.sources).toEqual([])
    expect(provenanceText(deduped.queue[1]?.sources ?? [])).toBe('search: barber')

    const started = createSnowball([], { maxDepth: 1, targetStrong: 10, minStrongRatio: 0, minFollowers: 1_000 }, DAY, ['barber', 'fade', 'barber'])
    expect(started.phase).toBe('search')
    expect(started.keywords).toEqual(['barber', 'fade'])
    expect(plan(started, DAY).step).toEqual({ type: 'search', keyword: 'barber' })
    const finished = walk(
      started,
      {
        'fade.room': { followers: 5_000, posts: strongPosts('fade.room'), following: [{ username: 'gina', followers: 2_000, via: 'following' }] },
        'other.shop': { followers: 8_000, posts: weakPosts('other.shop') },
        gina: { followers: 2_000, posts: weakPosts('gina') },
      },
      DAY,
      {
        barber: [
          { username: 'fade.room', followers: 5_000 },
          { username: 'tiny', followers: 10 },
        ],
        fade: searches.fade ?? [],
      },
    )
    expect(finished.accounts.map((account) => account.username)).toEqual(['fade.room', 'other.shop', 'gina'])
    expect(finished.accounts.find((account) => account.username === 'fade.room')).toMatchObject({
      provenance: 'search: barber; search: fade',
      depth: 0,
      grade: 'STRONG',
    })
    expect(finished.accounts.find((account) => account.username === 'gina')?.provenance).toBe('followed by fade.room')
    expect(finished.accounts.some((account) => account.username === 'tiny' || account.username === 'ada')).toBe(false)
  })

  it('caps accounts added for one keyword and keeps a paused search resumable', () => {
    const hits = Array.from({ length: 20 }, (_, index) => ({ username: `shop${index}`, followers: 100 }))
    const capped = applySearchCandidates(createSnowball([], { searchCap: 3 }, DAY, ['barber']), 'barber', hits, DAY)
    expect(capped.queue.map((item) => item.username)).toEqual(['shop0', 'shop1', 'shop2'])
    expect(capped.searched).toEqual(['barber'])
    const partial = applySearchCandidates(createSnowball([], {}, DAY, ['barber']), 'barber', hits.slice(0, 2), DAY, false)
    expect(partial.searched).toEqual([])
    expect(plan(partial, DAY).step).toEqual({ type: 'search', keyword: 'barber' })
    expect(parseKeywords('barber\nNail art, barber; #fade')).toEqual(['barber', 'Nail art', '#fade'])
  })

  it('exports grade, unpaid breakouts, and provenance', () => {
    const job = applyScore(createSnowball(['ada'], {}, DAY), { username: 'ada', followers: 80_000, posts: strongPosts('ada') }, DAY)
    const table = snowballAccountTable(job.accounts)
    expect(table[0]).toContain('Provenance')
    expect(table[1]?.[1]).toBe('STRONG')
    expect(table[1]?.[8]).toBe('seed')
    expect(provenanceText([{ from: 'ada', via: 'following' }, { from: 'bea', via: 'following' }])).toBe('followed by ada, bea')
  })
})
