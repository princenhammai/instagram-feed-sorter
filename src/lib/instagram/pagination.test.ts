import { describe, expect, it } from 'vitest'
import { mergePost, parseBodies, rememberPosts } from './capture'
import { extractItems } from './extract'
import { normalizeMedia } from './normalize'
import { postsForSurface, runSortCapture } from '../sort-capture'
import { samplePost } from '../sample'
import type { Post } from '../types'

const page1 = JSON.stringify({
  data: {
    xdt_api__v1__clips__user__connection_v2: {
      edges: [
        {
          node: {
            media: {
              pk: '1111111111111111111',
              code: 'Page1A',
              media_type: 2,
              product_type: 'clips',
              play_count: 1000,
              user: { username: 'omgadrian' },
            },
          },
        },
        {
          node: {
            media: {
              pk: '1111111111111111112',
              code: 'Page1B',
              media_type: 2,
              product_type: 'clips',
              play_count: 2000,
              user: { username: 'omgadrian' },
            },
          },
        },
      ],
    },
  },
})

/** A one-item `items` list sits beside the real page. Later clips omit media_type and username. */
const page2 = JSON.stringify({
  items: [
    {
      pk: '999',
      code: 'Decoy',
      media_type: 2,
      product_type: 'clips',
      user: { username: 'someoneelse' },
    },
  ],
  data: {
    xdt_api__v1__clips__user__connection_v2: {
      edges: [
        { node: { media: { pk: '2222222222222222221', code: 'Page2A', product_type: 'clips' } } },
        { node: { media: { pk: '2222222222222222222', code: 'Page2B', product_type: 'clips' } } },
        { node: { media: { pk: '2222222222222222223', code: 'Page2C', product_type: 'clips' } } },
      ],
    },
  },
})

/** These pks differ by 1 and collapse to one number under JSON.parse. */
const page3 =
  '{"data":{"xdt_api__v1__clips__user__connection_v2":{"edges":[' +
  '{"node":{"media":{"pk":3712345678901234567,"code":"Page3A","product_type":"clips","user":{"username":"omgadrian"}}}},' +
  '{"node":{"media":{"pk":3712345678901234568,"code":"Page3B","product_type":"clips","user":{"username":"omgadrian"}}}}' +
  ']}}}'

function absorb(text: string, into: Map<string, Post>, fallback = 'omgadrian', reelsGrid = false): void {
  for (const body of parseBodies(text)) rememberPosts(into, body, fallback, reelsGrid)
}

function laterCode(index: number): string {
  return `Later${String(index).padStart(6, '0')}`
}

/** Pages after the first screen are often a shortcode and nothing else. */
function laterPage(start: number): string {
  const edges = Array.from({ length: 6 }, (_, offset) => {
    const code = laterCode(start + offset)
    if (offset < 2) return { code }
    if (offset < 4) return { node: { code } }
    return { node: { media: { code } } }
  })
  return JSON.stringify({
    data: { xdt_api__v1__clips__user__connection_v2: { edges } },
  })
}

const fullFirstPage = JSON.stringify({
  items: [{ pk: '1', code: 'NotAReel', media_type: 1, user: { username: 'someoneelse' } }],
  data: {
    xdt_api__v1__clips__user__connection_v2: {
      edges: Array.from({ length: 12 }, (_, index) => ({
        node: {
          media: {
            pk: String(4_000_000_000_000_000_000n + BigInt(index)),
            code: `First${String(index).padStart(6, '0')}`,
            media_type: 2,
            product_type: 'clips',
            play_count: 1000 + index,
            user: { username: 'omgadrian' },
          },
        },
      })),
    },
  },
})

describe('paginated grid responses', () => {
  it('counts every reel across three pages', () => {
    const parsed = JSON.parse(page3) as {
      data: { xdt_api__v1__clips__user__connection_v2: { edges: { node: { media: { pk: number } } }[] } }
    }
    const collapsed = parsed.data.xdt_api__v1__clips__user__connection_v2.edges.map((edge) => edge.node.media.pk)
    expect(collapsed[0]).toBe(collapsed[1])

    const kept = parseBodies(page3)[0] as {
      data: { xdt_api__v1__clips__user__connection_v2: { edges: { node: { media: { pk: string } } }[] } }
    }
    const ids = kept.data.xdt_api__v1__clips__user__connection_v2.edges.map((edge) => edge.node.media.pk)
    expect(ids).toEqual(['3712345678901234567', '3712345678901234568'])

    const decoyPage = parseBodies(page2)[0]
    expect(extractItems(decoyPage).map((item) => (item as { code: string }).code).sort()).toEqual([
      'Decoy',
      'Page2A',
      'Page2B',
      'Page2C',
    ])

    const captured = new Map<string, Post>()
    absorb(page1, captured)
    absorb(page2, captured)
    absorb(page3, captured)
    const reels = postsForSurface([...captured.values()], 'omgadrian', 'reels')
    expect(reels.map((reel) => reel.shortcode).sort()).toEqual([
      'Page1A',
      'Page1B',
      'Page2A',
      'Page2B',
      'Page2C',
      'Page3A',
      'Page3B',
    ])
    expect(reels.find((reel) => reel.shortcode === 'Page2A')).toMatchObject({
      username: 'omgadrian',
      mediaKind: 'video',
    })
    expect(reels.find((reel) => reel.shortcode === 'Page3A')?.id).toBe('3712345678901234567')
    expect(reels.find((reel) => reel.shortcode === 'Page3B')?.id).toBe('3712345678901234568')
    expect(reels.some((reel) => reel.username === 'someoneelse')).toBe(false)
  })

  it('counts shortcode-only pages up to the requested total on the reels tab', async () => {
    const captured = new Map<string, Post>()
    absorb(fullFirstPage, captured, 'omgadrian', true)
    absorb(laterPage(0), captured, 'omgadrian', true)
    absorb(laterPage(6), captured, 'omgadrian', true)
    absorb(laterPage(12), captured, 'omgadrian', true)
    const reels = postsForSurface([...captured.values()], 'omgadrian', 'reels')
    const later = Array.from({ length: 18 }, (_, index) => laterCode(index))
    expect(reels).toHaveLength(30)
    expect(later.every((code) => reels.some((reel) => reel.shortcode === code && reel.mediaKind === 'video'))).toBe(true)
    expect(reels.some((reel) => reel.shortcode === 'NotAReel')).toBe(false)

    const withoutGrid = new Map<string, Post>()
    absorb(laterPage(0), withoutGrid, 'omgadrian', false)
    expect(postsForSurface([...withoutGrid.values()], 'omgadrian', 'reels')).toHaveLength(0)

    const kept = normalizeMedia({ code: laterCode(0) }, 'omgadrian', true)
    const sparse = normalizeMedia({ code: laterCode(0), media_type: 1 }, 'omgadrian', true)
    expect(kept?.mediaKind).toBe('video')
    expect(sparse?.mediaKind).toBe('image')
    expect(mergePost(kept ?? undefined, sparse ?? samplePost({ mediaKind: 'image' })).mediaKind).toBe('video')

    let reads = 0
    const result = await runSortCapture({
      read: async () => {
        reads += 1
        return reads === 1 ? reels.slice(0, 12) : reels
      },
      nudge: () => undefined,
      sleep: async () => true,
      limit: 30,
      signal: new AbortController().signal,
      idleRounds: 10,
      roundWaitMs: 1,
    })
    expect(result.posts).toHaveLength(30)
    expect(result.timedOut).toBe(false)
  })
})
