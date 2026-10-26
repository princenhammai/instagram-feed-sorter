import { describe, expect, it } from 'vitest'
import { fillMissingMedia, isInstagramDataUrl, mergePost, parseBodies } from './capture'
import { extractFollowerCounts, extractItems } from './extract'
import { normalizeMedia } from './normalize'
import { samplePost } from '../sample'

describe('reel details', () => {
  it('reads a video address from a dash manifest when no file list is present', () => {
    const post = normalizeMedia({
      pk: '1',
      code: 'x',
      media_type: 2,
      video_dash_manifest:
        '<Representation bandwidth="500000" width="480"><BaseURL>https://scontent.cdninstagram.com/small.mp4?x=1&amp;y=2</BaseURL></Representation>' +
        '<Representation bandwidth="2000000" width="1080"><BaseURL>https://scontent.cdninstagram.com/big.mp4</BaseURL></Representation>',
    })
    expect(post?.videoUrl).toBe('https://scontent.cdninstagram.com/big.mp4')
  })

  it('keeps captured counts and fills in the missing video', () => {
    const grid = samplePost({ views: 94000, likes: 1800, videoUrl: null, caption: '', duration: null })
    const full = samplePost({ views: null, likes: null, caption: 'real caption', duration: 21, videoUrl: 'https://scontent.cdninstagram.com/v.mp4' })
    expect(fillMissingMedia(grid, full)).toMatchObject({
      views: 94000,
      likes: 1800,
      caption: 'real caption',
      duration: 21,
      videoUrl: 'https://scontent.cdninstagram.com/v.mp4',
    })
  })

  it('reads duration and keeps a small rendition for transcription', () => {
    const post = normalizeMedia({
      pk: '1',
      code: 'x',
      media_type: 2,
      video_duration: 31.4,
      video_versions: [
        { url: 'https://scontent.cdninstagram.com/big.mp4', width: 1080 },
        { url: 'https://scontent.cdninstagram.com/small.mp4', width: 480 },
      ],
    })
    expect(post?.duration).toBe(31.4)
    expect(post?.videoUrl).toContain('big.mp4')
    expect(post?.videoLowUrl).toContain('small.mp4')
  })

  it('finds follower counts in profile payloads', () => {
    const counts = extractFollowerCounts({
      data: { user: { username: 'Creator', edge_followed_by: { count: 1200 } } },
      other: [{ user: { username: 'friend', follower_count: 55 } }],
    })
    expect(counts.get('creator')).toBe(1200)
    expect(counts.get('friend')).toBe(55)
  })
})

describe('captured page data', () => {
  it('parses guarded, plain, and streamed JSON bodies', () => {
    expect(parseBodies('for (;;);{"a":1}')).toEqual([{ a: 1 }])
    expect(parseBodies('{"a":1}\n{"b":2}\n{"c":')).toEqual([{ a: 1 }, { b: 2 }])
    expect(parseBodies('<html>')).toEqual([])
  })

  it('finds reels inside the graphql connection shape', () => {
    const payload = {
      data: {
        xdt_api__v1__clips__user__connection_v2: {
          edges: [
            {
              node: {
                media: {
                  pk: '3000000000000000000',
                  code: 'AbC',
                  media_type: 2,
                  product_type: 'clips',
                  play_count: 5_600_000,
                  like_count: 90_000,
                  user: { username: 'thediaryofaceopodcast' },
                },
              },
            },
          ],
          page_info: { end_cursor: 'x', has_next_page: true },
        },
      },
    }
    const items = extractItems(payload, 80)
    expect(items).toHaveLength(1)
    expect(normalizeMedia(items[0])).toMatchObject({ views: 5_600_000, username: 'thediaryofaceopodcast' })
  })

  it('keeps known counts when a later response leaves them out', () => {
    const first = samplePost({ id: '1', views: 500, likes: 9 })
    const later = samplePost({ id: '1', views: null, likes: 12, caption: '' })
    expect(mergePost(first, later)).toMatchObject({ views: 500, likes: 12, caption: 'hello' })
  })

  it('only listens to Instagram data endpoints', () => {
    const base = 'https://www.instagram.com/creator/reels/'
    expect(isInstagramDataUrl('/graphql/query', base)).toBe(true)
    expect(isInstagramDataUrl('https://www.instagram.com/api/v1/clips/user/', base)).toBe(true)
    expect(isInstagramDataUrl('/static/bundle.js', base)).toBe(false)
    expect(isInstagramDataUrl('https://example.com/graphql', base)).toBe(false)
  })
})
