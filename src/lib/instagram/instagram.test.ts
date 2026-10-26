import { describe, expect, it } from 'vitest'
import { instagramIdToMs, shortcodeToId } from './ids'
import { extractItems, extractNext, extractUserId, extractUsers } from './extract'
import { normalizeMedia } from './normalize'
import { collectPosts } from './collect'
import { findUserIdInText } from './page-data'
import { samplePost } from '../sample'

describe('instagram ids', () => {
  it('decodes shortcodes and media ids', () => {
    expect(shortcodeToId('A')).toBe('0')
    expect(shortcodeToId('B')).toBe('1')
    expect(shortcodeToId('BA')).toBe('64')
    const year = new Date(instagramIdToMs('3000000000000000000')).getUTCFullYear()
    expect(year).toBeGreaterThan(2018)
    expect(year).toBeLessThan(2028)
  })
})

describe('findUserIdInText', () => {
  it('reads the profile id next to the username in page data', () => {
    const text = '{"user":{"pk":"173560420","username":"TheDiaryOfACEOPodcast","full_name":"DOAC"},"other":{"id":"999"}}'
    expect(findUserIdInText(text, 'thediaryofaceopodcast')).toBe('173560420')
    expect(findUserIdInText(text, 'someoneelse')).toBeUndefined()
  })
})

describe('normalize and extract', () => {
  it('reads a reel, a carousel, and a photo', () => {
    const reel = normalizeMedia({
      pk: '3000000000000000000',
      code: 'AbC',
      media_type: 2,
      product_type: 'clips',
      play_count: 1200,
      like_count: 40,
      comment_count: 3,
      caption: { text: 'hook' },
      user: { username: 'ada' },
      video_versions: [{ url: 'https://scontent.cdninstagram.com/v.mp4', width: 720 }],
      image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/c.jpg', width: 360 }] },
    })
    expect(reel).toMatchObject({
      username: 'ada',
      views: 1200,
      mediaKind: 'video',
      url: 'https://www.instagram.com/reel/AbC/',
    })

    const carousel = normalizeMedia({
      pk: '10',
      code: 'Car',
      media_type: 8,
      carousel_media: [
        { image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/1.jpg', width: 100 }] } },
        { video_versions: [{ url: 'https://scontent.cdninstagram.com/2.mp4', width: 100 }] },
      ],
    })
    expect(carousel?.mediaKind).toBe('carousel')
    expect(carousel?.slides).toHaveLength(2)
    expect(carousel?.url).toContain('/p/Car/')
  })

  it('derives a date from the media id when taken_at is missing', () => {
    const post = normalizeMedia({ pk: '3000000000000000000', code: 'Zz', media_type: 1 })
    expect(post && post.takenAt > 0).toBe(true)
  })

  it('pulls items, the next page, the user id, and similar accounts', () => {
    const payload = {
      items: [{ media: { pk: '1', code: 'Aa', media_type: 1 } }, { pk: '2', code: 'Bb' }],
      next_max_id: 'cursor',
      more_available: true,
    }
    expect(extractItems(payload)).toHaveLength(2)
    expect(extractNext(payload)).toBe('cursor')
    expect(extractNext({ more_available: false, next_max_id: 'x' })).toBeUndefined()
    expect(extractUserId({ data: { user: { id: '99' } } })).toBe('99')
    expect(
      extractUsers({
        users: [
          { pk: '5', username: 'bee', full_name: 'Bee', is_verified: true },
          { pk: '5', username: 'bee' },
        ],
      }),
    ).toEqual([
      {
        id: '5',
        username: 'bee',
        fullName: 'Bee',
        verified: true,
        url: 'https://www.instagram.com/bee/',
        followers: null,
        avatarUrl: null,
        isPrivate: false,
        category: null,
        biography: null,
      },
    ])
  })

  it('reads related profiles and the discover chaining list', () => {
    const accounts = extractUsers({
      data: {
        user: {
          edge_related_profiles: {
            edges: [
              {
                node: {
                  id: '9',
                  username: 'other',
                  full_name: 'Other',
                  is_private: true,
                  category_name: 'Creator',
                  profile_pic_url: 'https://scontent.cdninstagram.com/a.jpg',
                  edge_followed_by: { count: 1200 },
                },
              },
            ],
          },
        },
        xdt_api__v1__discover__chaining: {
          users: [{ pk: '8', username: 'third', full_name: 'Third', follower_count: 50 }],
        },
      },
    })
    expect(accounts.map((account) => account.username)).toEqual(['other', 'third'])
    expect(accounts[0]).toMatchObject({
      followers: 1200,
      isPrivate: true,
      category: 'Creator',
      avatarUrl: 'https://scontent.cdninstagram.com/a.jpg',
    })
    expect(accounts[1]?.followers).toBe(50)
  })

  it('reads Instagram search results wrapped as user records', () => {
    const accounts = extractUsers({
      users: [{ position: 0, user: { pk: '4', username: 'barber.studio', full_name: 'Barber Studio', follower_count: 900 } }],
      hashtags: [{ name: 'barber' }],
    })
    expect(accounts.map((account) => account.username)).toEqual(['barber.studio'])
    expect(accounts[0]?.followers).toBe(900)
  })
})

describe('collectPosts', () => {
  it('stops at the count and at the start of a date window', async () => {
    const pages = [
      [samplePost({ id: '1', takenAt: 500 }), samplePost({ id: '2', takenAt: 400 })],
      [samplePost({ id: '3', takenAt: 300 }), samplePost({ id: '4', takenAt: 100 })],
    ]
    const result = await collectPosts({
      limit: 10,
      start: 250,
      signal: new AbortController().signal,
      delayMs: 0,
      load: async (maxId) => {
        const index = maxId ? 1 : 0
        return { posts: pages[index] ?? [], nextMaxId: index === 0 ? 'next' : undefined }
      },
    })
    expect(result.posts.map((post) => post.id)).toEqual(['1', '2', '3'])
    expect(result.capped).toBe(false)
  })

  it('keeps collected posts when a later page fails', async () => {
    const result = await collectPosts({
      limit: 10,
      signal: new AbortController().signal,
      delayMs: 0,
      load: async (maxId) => {
        if (maxId) throw new Error('rate limited')
        return { posts: [samplePost({ id: '1' })], nextMaxId: 'next' }
      },
    })
    expect(result.posts.map((post) => post.id)).toEqual(['1'])
    expect(result.interrupted).toBe('rate limited')
  })

  it('still fails when the first page fails', async () => {
    await expect(
      collectPosts({
        limit: 10,
        signal: new AbortController().signal,
        delayMs: 0,
        load: async () => {
          throw new Error('rate limited')
        },
      }),
    ).rejects.toThrow('rate limited')
  })

  it('returns a partial list when aborted', async () => {
    const signal = AbortSignal.abort()
    const result = await collectPosts({
      limit: 10,
      signal,
      delayMs: 0,
      load: async () => ({ posts: [samplePost({ id: '1' })] }),
    })
    expect(result.stopped).toBe(true)
    expect(result.posts).toHaveLength(0)
  })
})
