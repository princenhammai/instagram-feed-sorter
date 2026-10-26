import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { exportColumns, toCsv } from './export'
import { buildWorkbook, buildXlsx, columnName } from './xlsx'
import { buildDataUrl, describeSavedFile, downloadNames, judgeDownload, nextStrategy, queuedVerdict, runSaveAttempts, startFailureCode, textToBase64 } from './file-download'
import { filesForPost, isAllowedMediaUrl, needsZip, rankedVideoName, videoDownloadUrl } from './media-files'
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
    const book = await buildWorkbook([
      { name: 'Reels', rows: [['Account'], ['ada']] },
      { name: 'Summary', rows: [['Reels loaded'], [2]] },
    ])
    const workbook = await JSZip.loadAsync(book)
    expect(await workbook.file('xl/worksheets/sheet2.xml')?.async('string')).toContain('Reels loaded')
    expect(await workbook.file('xl/workbook.xml')?.async('string')).toContain('Summary')
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
    expect(rankedVideoName(1, 10, 'AbC', 'omgadrian')).toBe('rank01_omgadrian_AbC.mp4')
    expect(rankedVideoName(12, 200, 'AbC', 'omgadrian')).toBe('rank012_omgadrian_AbC.mp4')
    expect(videoDownloadUrl(video)).toBe('https://scontent.cdninstagram.com/video.mp4')
    expect(videoDownloadUrl(samplePost({ mediaKind: 'video', videoUrl: null }))).toBeNull()
  })
})

describe('file downloads', () => {
  it('treats a queued download as unfinished until Chrome says the file is complete', () => {
    expect(judgeDownload({ state: 'in_progress' })).toEqual({ done: false })
    expect(judgeDownload({ state: 'complete', filename: '/home/ada/Downloads/Instagram Feed Sorter/reels.csv' }).done).toBe(true)
    expect(judgeDownload({ state: 'interrupted', error: 'NETWORK_FAILED' })).toMatchObject({
      done: true,
      ok: false,
      code: 'NETWORK_FAILED',
    })
    expect(judgeDownload(null)).toMatchObject({ done: true, ok: false })
    expect(queuedVerdict({ state: 'in_progress' }).ok).toBe(true)
    expect(queuedVerdict(null).ok).toBe(false)
  })

  it('retries a folder path once, then switches save method when the file itself was rejected', async () => {
    expect(downloadNames('Instagram Feed Sorter/ada-reels.csv')).toEqual([
      'Instagram Feed Sorter/ada-reels.csv',
      'ada-reels.csv',
    ])
    expect(nextStrategy({ ok: false, code: 'FILE_FAILED' })).toBe('rename')
    expect(nextStrategy({ ok: false, code: 'NETWORK_FAILED' })).toBe('next-method')
    expect(startFailureCode('Invalid filename')).toBe('FILE_FAILED')
    expect(startFailureCode('Invalid URL')).toBe('NETWORK_INVALID_REQUEST')
    expect(nextStrategy({ ok: false, code: startFailureCode('Invalid filename') })).toBe('rename')
    const calls: string[] = []
    const saved = await runSaveAttempts(['folder/file.csv', 'file.csv'], [
      async (name) => {
        calls.push(`data:${name}`)
        return { ok: false, error: 'rejected', code: 'NETWORK_INVALID_REQUEST' }
      },
      async (name) => {
        calls.push(`blob:${name}`)
        return name === 'file.csv' ? { ok: true, filename: `/tmp/Downloads/${name}` } : { ok: false, error: 'path', code: 'FILE_FAILED' }
      },
    ])
    expect(saved).toMatchObject({ ok: true, filename: '/tmp/Downloads/file.csv' })
    expect(calls).toEqual(['data:folder/file.csv', 'blob:folder/file.csv', 'blob:file.csv'])
  })

  it('round-trips a CSV through a data URL and names the downloads folder', () => {
    const csv = toCsv(exportColumns(), [samplePost({ caption: 'bench day', views: 94000 })])
    const url = buildDataUrl('text/csv;charset=utf-8', textToBase64(csv))
    expect(url).toBeTruthy()
    const bytes = Uint8Array.from(atob(url!.split(',')[1] ?? ''), (char) => char.charCodeAt(0))
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const decoded = new TextDecoder().decode(bytes)
    expect(decoded).toBe(csv.replace(/^\uFEFF/, ''))
    expect(decoded).toContain('Duration (s)')
    expect(describeSavedFile('/home/ada/Downloads/Instagram Feed Sorter/ada-reels.csv')).toBe(
      'Downloads/Instagram Feed Sorter/ada-reels.csv',
    )
  })
})
