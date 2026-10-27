import { describe, expect, it } from 'vitest'
import { buildReelExport, reelIsAd } from './reel-export'
import { samplePost } from './sample'
import type { ExportReel } from './reel-export'

const NOW = new Date(2026, 9, 27, 15)

function reel(overrides: Partial<ExportReel> = {}): ExportReel {
  return { ...samplePost({ username: 'ada', takenAt: Date.UTC(2024, 0, 2), duration: 12 }), ...overrides }
}

describe('reel csv export', () => {
  it('escapes commas, quotes, and newlines in captions', () => {
    const csv = buildReelExport([reel({ caption: 'xin chào, "bạn"\nline two' })], {
      includeAds: false,
      username: 'ada',
      now: NOW,
    }).csv
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"xin chào, ""bạn""\nline two"')
    expect(csv.startsWith('\uFEFFrank,username,shortcode,url,views,likes,comments,posted_date,caption,duration_seconds,outlier_score,is_ad\r\n')).toBe(true)
  })

  it('hides paid partnerships and ad flags unless include ads is set', () => {
    const posts = [
      reel({ id: '1', shortcode: 'keep', views: 100 }),
      reel({ id: '2', shortcode: 'paid', views: 200, paidPartnership: true }),
      reel({ id: '3', shortcode: 'rawpaid', views: 300, is_paid_partnership: true }),
      reel({ id: '4', shortcode: 'flagged', views: 400, isAd: true }),
      reel({ id: '5', shortcode: 'adfield', views: 500, ad: true }),
    ]
    const hidden = buildReelExport(posts, { includeAds: false, username: 'ada', now: NOW })
    expect(hidden.rows).toBe(1)
    expect(hidden.csv).toContain('keep')
    expect(hidden.csv).not.toContain('paid')
    expect(hidden.csv).not.toContain('rawpaid')
    expect(hidden.csv).not.toContain('flagged')
    expect(hidden.csv).not.toContain('adfield')
    expect(reelIsAd(posts[1]!)).toBe(true)

    const shown = buildReelExport(posts, { includeAds: true, username: 'ada', now: NOW })
    expect(shown.rows).toBe(5)
    expect(shown.csv).toContain(',true')
    expect(shown.csv).toContain(',false')
  })

  it('scores outliers as views divided by the account median', () => {
    const posts = [
      reel({ id: 'a', shortcode: 'low', views: 10 }),
      reel({ id: 'b', shortcode: 'mid', views: 30 }),
      reel({ id: 'c', shortcode: 'ad', views: 1000, paidPartnership: true }),
    ]
    const file = buildReelExport(posts, { includeAds: false, username: 'ada', now: NOW })
    expect(file.csv).toContain('low,https://www.instagram.com/reel/low/,10,')
    expect(file.csv).toContain(',0.33,')
    expect(file.csv).toContain(',1.00,')
    expect(file.csv).not.toContain('1000')
  })

  it('keeps the current order and ranks from 1', () => {
    const posts = [
      reel({ id: 'z', shortcode: 'second', views: 50 }),
      reel({ id: 'a', shortcode: 'first', views: 10 }),
    ]
    const file = buildReelExport(posts, { includeAds: true, username: '@ada', now: NOW })
    const lines = file.csv.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[1]?.startsWith('1,ada,second,')).toBe(true)
    expect(lines[2]?.startsWith('2,ada,first,')).toBe(true)
    expect(file.filename).toBe('ada-reels-2026-10-27.csv')
    expect(file.tsv.split('\n')[1]).toContain('https://www.instagram.com/reel/second/')
    expect(file.csv).toContain('2024-01-02T00:00:00.000Z')
  })

  it('keeps only the first 200 characters of a caption', () => {
    const caption = `${'á'.repeat(180)} end of the sentence that should be cut`
    const file = buildReelExport([reel({ caption })], { includeAds: false, username: 'ada', now: NOW })
    expect(file.csv).toContain('á'.repeat(180))
    expect(file.csv).not.toContain('should be cut')
  })
})
