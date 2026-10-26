import { describe, expect, it } from 'vitest'
import { parseBodies, rememberPosts } from './capture'
import { extractItems } from './extract'
import { postsForSurface } from '../sort-capture'
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

function absorb(text: string, into: Map<string, Post>, fallback = 'omgadrian'): void {
  for (const body of parseBodies(text)) rememberPosts(into, body, fallback)
}

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
})
