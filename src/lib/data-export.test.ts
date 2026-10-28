import { describe, expect, it, vi } from 'vitest'
import { dataExportCsv, dataExportFilename, dataExportJson, dataExportRecords } from './export'
import { samplePost } from './sample'
import { decodeDataDownloadUrl, saveTextDownload } from './text-download'

const NOW = new Date(2026, 9, 28, 18, 30)

function reels() {
  return [
    samplePost({
      id: '1',
      username: 'ada',
      shortcode: 'keep',
      url: 'https://www.instagram.com/reel/keep/',
      views: 1200,
      likes: 40,
      comments: 3,
      outlierScore: 1.256,
      takenAt: Date.UTC(2024, 0, 2, 3, 4, 5),
      duration: 12.5,
      caption: 'xin chào, "bạn"\nnext',
      videoUrl: 'https://scontent.cdninstagram.com/keep.mp4',
    }),
    samplePost({
      id: '2',
      username: 'ada',
      shortcode: 'second',
      views: null,
      likes: null,
      comments: null,
      outlierScore: null,
      duration: null,
      caption: 'plain',
      videoUrl: null,
      slides: [{ kind: 'video', url: 'https://scontent.cdninstagram.com/second.mp4' }],
    }),
  ]
}

describe('profile data export', () => {
  it('writes the requested columns in the current order', () => {
    const records = dataExportRecords(reels())
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      rank: 1,
      username: 'ada',
      shortcode: 'keep',
      url: 'https://www.instagram.com/reel/keep/',
      views: 1200,
      likes: 40,
      comments: 3,
      outlier_x: 1.26,
      date: '2024-01-02T03:04:05.000Z',
      duration_s: 12.5,
      video_url: 'https://scontent.cdninstagram.com/keep.mp4',
    })
    expect(records[1]).toMatchObject({
      rank: 2,
      views: null,
      outlier_x: null,
      duration_s: null,
      video_url: 'https://scontent.cdninstagram.com/second.mp4',
    })
    const csv = dataExportCsv(reels())
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.startsWith('\uFEFFrank,username,shortcode,url,views,likes,comments,outlier_x,date,duration_s,caption,video_url\r\n')).toBe(true)
    expect(csv).toContain('"xin chào, ""bạn""\nnext"')
    expect(csv).toContain(',1.26,')
    expect(dataExportFilename('@ada', NOW, 'csv')).toBe('ifs-ada-2026-10-28.csv')
    const json = JSON.parse(dataExportJson(reels())) as { rank: number }[]
    expect(json.map((row) => row.rank)).toEqual([1, 2])
  })

  it('saves the csv only after the downloads API returns an id', async () => {
    const posts = reels()
    const csv = dataExportCsv(posts)
    const filename = dataExportFilename('ada', NOW, 'csv')
    let file = ''
    const download = vi.fn(async (options: { url: string; filename: string; saveAs: boolean }) => {
      expect(options.saveAs).toBe(false)
      expect(options.filename).toBe(filename)
      expect(options.url.startsWith('data:text/csv;charset=utf-8;base64,')).toBe(true)
      file = decodeDataDownloadUrl(options.url)
      return 25
    })
    const saved = await saveTextDownload({ download }, { filename, mime: 'text/csv;charset=utf-8', text: csv })
    expect(saved).toEqual({ ok: true, downloadId: 25 })
    const body = file.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(body).toHaveLength(posts.length + 1)
    expect(body[1]).toContain('ada,keep,')
    expect(body[2]).toContain(',second,')
  })

  it('returns the downloads error and does not claim a row count', async () => {
    const result = await saveTextDownload(
      {
        download: async () => {
          throw new Error('Download canceled')
        },
      },
      { filename: 'ifs-ada-2026-10-28.json', mime: 'application/json', text: dataExportJson(reels()) },
    )
    expect(result).toEqual({ ok: false, error: 'Download canceled' })
  })
})
