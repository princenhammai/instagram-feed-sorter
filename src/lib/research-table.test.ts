import { describe, expect, it } from 'vitest'
import { compactReel } from './batch'
import { orderResearchRows, researchReelTable, researchRows } from './research-table'
import { samplePost } from './sample'

function reel(username: string, id: string, views: number, likes: number, caption = 'A real hook') {
  return compactReel(
    samplePost({
      id,
      shortcode: id,
      username,
      views,
      likes,
      comments: 2,
      caption,
      url: `https://www.instagram.com/reel/${id}/`,
    }),
  )
}

describe('research table', () => {
  const rows = researchRows([
    {
      username: 'ada',
      followers: 10_000,
      reels: [
        reel('ada', 'a1', 1_000, 40),
        reel('ada', 'a2', 1_000, 80),
        reel('ada', 'a3', 1_000, 40),
        reel('ada', 'breakout', 8_000, 320, 'This one traveled'),
        reel('ada', 'paid', 9_000, 400, 'Launch #ad'),
      ],
    },
    {
      username: 'bob',
      followers: 10_000,
      reels: [reel('bob', 'b1', 2_000, 200), reel('bob', 'b2', 2_000, 200), reel('bob', 'b3', 2_000, 200)],
    },
  ])

  it('hides paid rows by default and sorts by × median', () => {
    const ordered = orderResearchRows(rows, 'median', true)
    expect(ordered.map((row) => row.shortcode)).toEqual(['breakout', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3'])
    expect(ordered.some((row) => row.likelyPaid)).toBe(false)
    expect(ordered[0]?.medianScore).toBe(8)
    expect(ordered[0]?.hook).toBe('This one traveled')
    const sourced = researchRows([
      { username: 'cara', followers: 1000, provenance: 'search: barber', reels: [reel('cara', 'c1', 500, 20)] },
    ])
    expect(sourced[0]?.provenance).toBe('search: barber')
  })

  it('can sort by engagement and reveal paid rows', () => {
    const ordered = orderResearchRows(rows, 'engagement', false)
    expect(ordered[0]?.shortcode).toBe('b1')
    expect(ordered.some((row) => row.shortcode === 'paid')).toBe(true)
    const table = researchReelTable(ordered)
    expect(table[0]).toContain('× median')
    expect(table.some((row) => row[5] === 'Yes')).toBe(true)
  })
})
