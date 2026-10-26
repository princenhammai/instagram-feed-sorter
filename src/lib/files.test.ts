import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildXlsx, columnName } from './xlsx'
import { filesForPost, isAllowedMediaUrl, needsZip } from './media-files'
import { samplePost } from './sample'

describe('xlsx', () => {
  it('names columns and writes a spreadsheet zip', async () => {
    expect(columnName(0)).toBe('A')
    expect(columnName(25)).toBe('Z')
    expect(columnName(26)).toBe('AA')
    const bytes = await buildXlsx('Reels', [
      ['Caption', 'Views'],
      ['a & b', 12],
    ])
    const zip = await JSZip.loadAsync(bytes)
    const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string')
    expect(sheet).toContain('a &amp; b')
    expect(sheet).toContain('<v>12</v>')
  })
})

describe('media files', () => {
  it('accepts Instagram CDN urls and plans carousel zips', () => {
    expect(isAllowedMediaUrl('https://scontent.cdninstagram.com/v.mp4')).toBe(true)
    expect(isAllowedMediaUrl('https://instagram.fdel1-1.fna.fbcdn.net/v.mp4')).toBe(true)
    expect(isAllowedMediaUrl('http://scontent.cdninstagram.com/v.mp4')).toBe(false)
    expect(isAllowedMediaUrl('https://evil.example/v.mp4')).toBe(false)

    const video = samplePost()
    expect(needsZip([video])).toBe(false)
    expect(filesForPost(video)).toEqual([
      { name: 'creator-abc.mp4', url: 'https://scontent.cdninstagram.com/video.mp4' },
    ])

    const carousel = samplePost({
      mediaKind: 'carousel',
      videoUrl: null,
      slides: [
        { kind: 'image', url: 'https://scontent.cdninstagram.com/1.jpg' },
        { kind: 'video', url: 'https://scontent.cdninstagram.com/2.mp4' },
      ],
    })
    expect(needsZip([carousel])).toBe(true)
    expect(filesForPost(carousel).map((file) => file.name)).toEqual([
      'creator-abc/creator-abc-1.jpg',
      'creator-abc/creator-abc-2.mp4',
    ])

    expect(filesForPost(samplePost({ mediaKind: 'video', videoUrl: null }))).toEqual([])
    expect(filesForPost(video, 0)[0]?.name).toBe('001-creator-abc.mp4')
    expect(filesForPost(video, 11)[0]?.name).toBe('012-creator-abc.mp4')
  })
})
