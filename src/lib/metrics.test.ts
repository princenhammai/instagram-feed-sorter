import { describe, expect, it } from 'vitest'
import { engagementRate } from './outlier'
import { captionHook, median, medianScoreOf, paidSignalsFor, withResearch } from './research'
import { samplePost } from './sample'

describe('parsing and research metrics', () => {
  it('computes the median, including an even count', () => {
    expect(median([])).toBeNull()
    expect(median([4])).toBe(4)
    expect(median([9, 1, 5])).toBe(5)
    expect(median([1, 100])).toBe(50.5)
  })

  it('scores views as a multiple of the set median', () => {
    expect(medianScoreOf(900, 300)).toBe(3)
    expect(medianScoreOf(10, 0)).toBeNull()
    expect(medianScoreOf(null, 300)).toBeNull()
    const scored = withResearch([
      samplePost({ id: 'a', views: 100, likes: 10, comments: 0 }),
      samplePost({ id: 'b', views: 400, likes: 40, comments: 0 }),
    ])
    expect(scored.map((post) => post.medianScore)).toEqual([0.4, 1.6])
  })

  it('computes engagement from likes and comments over views', () => {
    expect(engagementRate(samplePost({ likes: 8, comments: 2, views: 100 }), 5000)).toBe(0.1)
    expect(engagementRate(samplePost({ likes: 8, comments: 2, views: null }), 1000)).toBe(0.01)
    expect(engagementRate(samplePost({ likes: null, comments: null, views: 100 }), 1000)).toBeNull()
  })

  it('flags paid captions, partnership metadata, and a collapsed like rate', () => {
    const medianViews = 100
    const medianLikeRate = 0.04
    const disclosed = samplePost({ id: 'ad', views: 100, likes: 4, caption: 'hello #sponsored' })
    expect(paidSignalsFor(disclosed, medianLikeRate, medianViews)).toEqual(['#sponsored'])
    const partner = samplePost({ id: 'partner', views: 100, likes: 4, paidPartnership: true, caption: 'Care that fits. #ad' })
    expect(paidSignalsFor(partner, medianLikeRate, medianViews)).toEqual(expect.arrayContaining(['#ad', 'paid partnership']))
    const flagged = withResearch([partner])
    expect(flagged[0]?.likelyPaid).toBe(true)
    expect(flagged[0]?.paidSignals).toEqual(expect.arrayContaining(['#ad', 'paid partnership']))
    const quiet = samplePost({ id: 'quiet', views: 1_000_000, likes: 100, caption: 'care' })
    expect(paidSignalsFor(quiet, medianLikeRate, medianViews)).toEqual(['low like rate'])
    const small = samplePost({ id: 'small', views: 10, likes: 0, caption: 'new' })
    expect(paidSignalsFor(small, medianLikeRate, medianViews)).toEqual([])
    const scored = withResearch([
      samplePost({ id: 'organic', views: 1000, likes: 40, comments: 1, caption: 'morning' }),
      samplePost({ id: 'ad', views: 1000, likes: 40, comments: 1, caption: 'Morning\n#ad #adaptive' }),
    ])
    expect(scored[1]?.likelyPaid).toBe(true)
    expect(scored[1]?.paidSignals).toEqual(['#ad'])
    expect(scored[0]?.likelyPaid).toBe(false)
  })

  it('keeps the first caption line that is not only tags', () => {
    expect(captionHook('#reels #fyp\nStop scrolling if you film\n#ad')).toBe('Stop scrolling if you film')
    expect(captionHook('Care that fits. #sponsored')).toBe('Care that fits.')
    expect(captionHook('@studio.north just posted')).toBe('just posted')
    expect(captionHook('#ad')).toBe('')
    expect(captionHook('a'.repeat(130)).endsWith('…')).toBe(true)
    expect(captionHook('a'.repeat(130))).toHaveLength(110)
  })
})
