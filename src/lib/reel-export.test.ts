import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildXlsx } from './xlsx'
import { buildReelExport, reelIsAd, type ExportReel } from './reel-export'
import { samplePost } from './sample'

const NOW = new Date(2026, 9, 27, 15)

function reel(overrides: Partial<ExportReel> = {}): ExportReel {
  return { ...samplePost({ username: 'ada', takenAt: Date.UTC(2024, 0, 2), duration: 12.34, likes: 8, comments: 1 }), ...overrides }
}

const posts: ExportReel[] = [
  reel({
    id: '1',
    shortcode: 'keep',
    views: 10,
    caption: 'xin chào, "bạn"\nline two & more',
  }),
  reel({ id: '2', shortcode: 'mid', views: 30, caption: '=SUM(A1)', likes: null, comments: null, duration: null }),
  reel({ id: '3', shortcode: 'blank', views: null, caption: `${'á'.repeat(180)} end of the sentence that should be cut` }),
  reel({ id: '4', shortcode: 'paid', views: 1000, paidPartnership: true, is_paid_partnership: true }),
]

function exported(includeAds: boolean) {
  return buildReelExport(posts, { includeAds, username: '@ada', now: NOW })
}

describe('reel export formats', () => {
  it('writes an Excel-ready CSV with a BOM, quoted captions, and two-decimal outliers', () => {
    const file = exported(false)
    expect(file.rows).toBe(3)
    expect(file.filename).toBe('ada-reels-2026-10-27.csv')
    expect(file.csv.charCodeAt(0)).toBe(0xfeff)
    expect(file.csv.startsWith('\uFEFFRank,Username,Shortcode,URL,Views,Likes,Comments,Posted date,Caption,Duration (s),Outlier score,Is ad\r\n')).toBe(true)
    expect(file.csv).toContain('"xin chào, ""bạn""\nline two & more"')
    expect(file.csv).toContain("'=SUM(A1)")
    expect(file.csv).toContain('https://www.instagram.com/reel/keep/')
    expect(file.csv).toContain('2024-01-02T00:00:00.000Z')
    expect(file.csv).toContain(',0.33,No')
    expect(file.csv).toContain(',1.00,No')
    expect(file.csv).toContain(',12.3,,No')
    expect(file.csv).not.toContain('paid')
    expect(file.csv).not.toContain('should be cut')
    expect(file.csv).toContain('á'.repeat(180))
    expect(reelIsAd(posts[3]!)).toBe(true)
  })

  it('copies the same rows as TSV for Google Sheets', () => {
    const file = exported(false)
    expect(file.tsv.split('\n')[0]?.split('\t')).toEqual([...file.headers])
    expect(file.tsv).toContain('1\tada\tkeep\thttps://www.instagram.com/reel/keep/\t10\t8\t1\t2024-01-02T00:00:00.000Z\t')
    expect(file.tsv).toContain('"xin chào, ""bạn""\nline two & more"')
    expect(file.tsv).toContain("'=SUM(A1)")
    expect(file.tsv).toContain('\t0.33\tNo')
    expect(file.tsv).toContain('\t1.00\tNo')
    expect(file.tsv).not.toContain('1000')
  })

  it('writes JSON with numbers, nulls, and a real ad flag', () => {
    const hidden = exported(false)
    const records = JSON.parse(hidden.json) as Record<string, unknown>[]
    expect(records).toHaveLength(3)
    expect(records[0]).toMatchObject({
      Rank: 1,
      Username: 'ada',
      Shortcode: 'keep',
      URL: 'https://www.instagram.com/reel/keep/',
      Views: 10,
      Likes: 8,
      Comments: 1,
      'Posted date': '2024-01-02T00:00:00.000Z',
      'Duration (s)': 12.3,
      'Outlier score': 0.33,
      'Is ad': false,
    })
    expect(records[1]).toMatchObject({
      Rank: 2,
      Shortcode: 'mid',
      Likes: null,
      Comments: null,
      'Duration (s)': null,
      'Outlier score': 1,
      Caption: '=SUM(A1)',
    })
    expect(records[2]).toMatchObject({ Views: null, 'Outlier score': null, 'Is ad': false })
    expect(String(records[2]?.Caption)).toHaveLength(200)

    const shown = JSON.parse(exported(true).json) as { Shortcode: string; 'Is ad': boolean; 'Outlier score': number | null }[]
    expect(shown.map((row) => row.Shortcode)).toEqual(['keep', 'mid', 'blank', 'paid'])
    expect(shown.filter((row) => row['Is ad']).map((row) => row.Shortcode)).toEqual(['paid'])
    expect(shown[0]?.['Outlier score']).toBe(0.33)
    expect(shown[3]?.['Outlier score']).toBe(33.33)
  })

  it('writes an Excel workbook with numeric metrics and escaped captions', async () => {
    const file = exported(true)
    const bytes = await buildXlsx('Reels', file.sheet)
    const zip = await JSZip.loadAsync(bytes)
    const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string')
    expect(sheet).toContain('Rank')
    expect(sheet).toContain('Outlier score')
    expect(sheet).toContain('https://www.instagram.com/reel/paid/')
    expect(sheet).toContain('line two &amp; more')
    expect(sheet).toContain("'=SUM(A1)")
    expect(sheet).toContain('<v>10</v>')
    expect(sheet).toContain('<v>0.33</v>')
    expect(sheet).toContain('<v>1</v>')
    expect(sheet).toContain('<v>33.33</v>')
    expect(sheet).toContain('<v>12.3</v>')
    expect(sheet).toContain('>Yes</t>')
    expect(sheet).toContain('>No</t>')
    expect(file.sheet[1]?.[4]).toBe(10)
    expect(file.sheet[1]?.[10]).toBe(0.33)
    expect(file.sheet[4]?.[11]).toBe('Yes')
  })

  it('keeps the given order as rank 1, 2, 3', () => {
    const file = exported(false)
    const keep = file.csv.indexOf('1,ada,keep,')
    const mid = file.csv.indexOf('2,ada,mid,')
    const blank = file.csv.indexOf('3,ada,blank,')
    expect(keep).toBeGreaterThan(0)
    expect(mid).toBeGreaterThan(keep)
    expect(blank).toBeGreaterThan(mid)
  })
})
