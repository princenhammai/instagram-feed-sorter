import { describe, expect, it } from 'vitest'
import { samplePost } from './sample'
import {
  allowProgressPaint,
  gridCaptureSnippet,
  postsForSurface,
  runSortCapture,
  SORT_IDLE_ROUNDS,
} from './sort-capture'
import type { Post } from './types'

function reel(id: string, takenAt: number, username = 'omgadrian'): Post {
  return samplePost({ id, shortcode: id, username, takenAt, mediaKind: 'video' })
}

describe('runSortCapture', () => {
  it('keeps the first page and adds reels that arrive after a scroll', async () => {
    const first = Array.from({ length: 5 }, (_, index) => reel(`p${index}`, 1_000 + index))
    const second = [...first, ...Array.from({ length: 12 }, (_, index) => reel(`n${index}`, 2_000 + index))]
    let nudged = 0
    const seen: number[] = []
    const result = await runSortCapture({
      read: async () => (nudged === 0 ? first : second),
      nudge: () => {
        nudged += 1
      },
      sleep: async () => true,
      limit: 30,
      signal: new AbortController().signal,
      onProgress: (count) => seen.push(count),
    })
    expect(result.timedOut).toBe(false)
    expect(result.posts).toHaveLength(17)
    expect(result.posts.map((post) => post.shortcode)).toContain('n11')
    expect(nudged).toBeGreaterThan(0)
    expect(Math.min(...seen)).toBe(5)
    expect(seen[seen.length - 1]).toBe(17)
  })

  it('stops after idle rounds when the page does not grow', async () => {
    const page = Array.from({ length: 5 }, (_, index) => reel(`p${index}`, index))
    let reads = 0
    const result = await runSortCapture({
      read: async () => {
        reads += 1
        return page
      },
      nudge: () => undefined,
      sleep: async () => true,
      limit: 30,
      signal: new AbortController().signal,
    })
    expect(result.posts).toHaveLength(5)
    expect(result.timedOut).toBe(false)
    expect(reads).toBe(1 + SORT_IDLE_ROUNDS)
  })

  it('does not drop the first page or spin when a later read is empty', async () => {
    const page = Array.from({ length: 5 }, (_, index) => reel(`p${index}`, 5_000 - index))
    let reads = 0
    const seen: number[] = []
    const result = await runSortCapture({
      read: async () => {
        reads += 1
        return reads % 2 === 1 ? page : []
      },
      nudge: () => undefined,
      sleep: async () => true,
      limit: 30,
      signal: new AbortController().signal,
      onProgress: (count) => seen.push(count),
    })
    expect(result.posts).toHaveLength(5)
    expect(result.posts[0]?.shortcode).toBe('p0')
    expect(result.timedOut).toBe(false)
    expect(reads).toBe(1 + SORT_IDLE_ROUNDS)
    expect(seen.every((count) => count === 5)).toBe(true)
  })

  it('keeps the first read when the deadline has already passed', async () => {
    let reads = 0
    const result = await runSortCapture({
      read: async () => {
        reads += 1
        return [reel('p0', 10)]
      },
      nudge: () => undefined,
      sleep: async () => true,
      limit: 30,
      signal: new AbortController().signal,
      deadlineAt: Date.now() - 1,
    })
    expect(result.timedOut).toBe(true)
    expect(result.posts.map((post) => post.shortcode)).toEqual(['p0'])
    expect(reads).toBe(1)
  })
})

describe('grid capture notes', () => {
  it('keeps only this account’s videos', () => {
    const posts = postsForSurface(
      [
        samplePost({ id: '1', username: 'abeparker', mediaKind: 'video' }),
        samplePost({ id: '2', username: '', mediaKind: 'video', url: 'https://www.instagram.com/reel/x/' }),
        samplePost({ id: '3', username: 'abeparker', mediaKind: 'image' }),
        samplePost({ id: '4', username: 'other', mediaKind: 'video' }),
      ],
      'AbeParker',
      'reels',
    )
    expect(posts.map((post) => post.id)).toEqual(['1'])
  })

  it('describes a timeout without pretending the grid never loaded', () => {
    expect(gridCaptureSnippet(5, false)).toEqual({ status: 200, snippet: '5 reels read from the page grid' })
    expect(gridCaptureSnippet(5, true).snippet).toContain('stopped at 90s')
    expect(gridCaptureSnippet(0, true)).toEqual({
      status: 0,
      snippet: 'Timed out after 90s. No reels were captured.',
    })
    expect(gridCaptureSnippet(0, false).snippet).toBe('No reels were captured from this profile.')
  })

  it('throttles progress paints', () => {
    const state = { count: -1, at: 0 }
    expect(allowProgressPaint(state, 0, 1_000)).toBe(true)
    expect(allowProgressPaint(state, 5, 1_100)).toBe(false)
    expect(allowProgressPaint(state, 5, 1_800)).toBe(true)
    expect(allowProgressPaint(state, 5, 2_000)).toBe(false)
  })
})
