import { describe, expect, it } from 'vitest'
import { nextIdle, reelsForAccount } from './grid-reels'
import { samplePost } from './sample'

describe('profile grid reels', () => {
  it('keeps that account’s videos and fills a missing username', () => {
    const posts = reelsForAccount(
      [
        samplePost({ id: '1', shortcode: 'aaa', username: 'abeparker', mediaKind: 'video' }),
        samplePost({ id: '2', shortcode: 'bbb', username: '', mediaKind: 'image', url: 'https://www.instagram.com/reel/bbb/' }),
        samplePost({ id: '3', shortcode: 'ccc', username: 'other', mediaKind: 'video' }),
        samplePost({ id: '1', shortcode: 'aaa', username: 'abeparker', mediaKind: 'video' }),
      ],
      'AbeParker',
    )
    expect(posts.map((post) => post.shortcode)).toEqual(['aaa', 'bbb'])
    expect(posts[1]?.username).toBe('AbeParker')
  })

  it('resets the idle count only when new reels arrive', () => {
    expect(nextIdle(5, 5, 2)).toBe(3)
    expect(nextIdle(5, 12, 3)).toBe(0)
  })
})
