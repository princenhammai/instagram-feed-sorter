export const DATA_URL_CHAR_LIMIT = 1_500_000

export interface SaveAttempt {
  ok: boolean
  error?: string
  code?: string
  filename?: string
}

export interface DownloadProbe {
  state?: string
  error?: string
  filename?: string
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

export function buildDataUrl(mime: string, base64: string): string | null {
  const type = mime.split(';')[0]?.trim() || 'application/octet-stream'
  const charset = type.startsWith('text/') || type === 'application/json' ? ';charset=utf-8' : ''
  const url = `data:${type}${charset};base64,${base64}`
  return url.length <= DATA_URL_CHAR_LIMIT ? url : null
}

export function downloadErrorText(code: string | undefined): string {
  switch (code) {
    case 'USER_CANCELED':
      return 'The download was canceled before a file was saved.'
    case 'FILE_FAILED':
    case 'FILE_ACCESS_DENIED':
    case 'FILE_NAME_TOO_LONG':
      return 'Chrome could not write that file. Check the downloads folder and try again.'
    case 'FILE_NO_SPACE':
      return 'Chrome could not save the file because the disk is full.'
    case 'NETWORK_FAILED':
    case 'NETWORK_INVALID_REQUEST':
      return 'Chrome accepted the export but did not save a file.'
    case 'TIMEOUT':
      return 'Chrome started the export but did not save the file. Check the download bar for a blocked item.'
    default:
      return code
        ? `Chrome did not save the file (${code.replace(/_/g, ' ').toLowerCase()}).`
        : 'Chrome did not save the file.'
  }
}

/** Chrome rejects some filenames before a download id exists. Those should retry a flatter name. */
export function startFailureCode(message: string): string | undefined {
  if (/filename|file name|directory|not a valid path/i.test(message)) return 'FILE_FAILED'
  if (/access denied/i.test(message)) return 'FILE_ACCESS_DENIED'
  if (/invalid url|too large|too long|data url/i.test(message)) return 'NETWORK_INVALID_REQUEST'
  return undefined
}

export function pathFailure(code: string | undefined): boolean {
  return code === 'FILE_FAILED' || code === 'FILE_ACCESS_DENIED' || code === 'FILE_NAME_TOO_LONG'
}

export function flatDownloadName(filename: string): string | null {
  const base = filename.split('/').filter(Boolean).pop() || ''
  if (!base || base === filename) return null
  return base
}

export function downloadNames(filename: string): string[] {
  const names = [filename]
  const flat = flatDownloadName(filename)
  if (flat) names.push(flat)
  return names
}

export function judgeDownload(
  item: DownloadProbe | null | undefined,
): { done: false } | { done: true; ok: true; filename?: string } | { done: true; ok: false; error: string; code?: string } {
  if (item == null) return { done: true, ok: false, error: downloadErrorText(undefined) }
  if (!item.state || item.state === 'in_progress') return { done: false }
  if (item.state === 'complete') return { done: true, ok: true, filename: item.filename }
  return { done: true, ok: false, error: downloadErrorText(item.error), code: item.error }
}

/** A media download may still be transferring. A missing or interrupted item is a failure. */
export function queuedVerdict(
  item: DownloadProbe | null | undefined,
): { ok: true; filename?: string } | { ok: false; error: string; code?: string } {
  if (item == null) return { ok: false, error: 'Chrome did not keep that download.' }
  const verdict = judgeDownload(item)
  if (!verdict.done || verdict.ok) return { ok: true, filename: item.filename }
  return { ok: false, error: verdict.error, code: verdict.code }
}

export type SaveStep = 'done' | 'rename' | 'next-method'

export function nextStrategy(attempt: SaveAttempt): SaveStep {
  if (attempt.ok) return 'done'
  if (pathFailure(attempt.code)) return 'rename'
  return 'next-method'
}

export async function runSaveAttempts(
  names: string[],
  methods: Array<(name: string) => Promise<SaveAttempt>>,
): Promise<SaveAttempt> {
  let last: SaveAttempt = { ok: false, error: downloadErrorText(undefined) }
  for (const method of methods) {
    for (let index = 0; index < names.length; index += 1) {
      const attempt = await method(names[index])
      if (attempt.ok) return attempt
      last = attempt
      if (nextStrategy(attempt) === 'rename' && index < names.length - 1) continue
      break
    }
  }
  return last
}

export function describeSavedFile(filename: string | undefined): string {
  if (!filename) return 'your downloads folder'
  const parts = filename.split(/[/\\]/).filter(Boolean)
  let downloads = -1
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index].toLowerCase() === 'downloads') {
      downloads = index
      break
    }
  }
  const tail = downloads >= 0 ? parts.slice(downloads) : parts.slice(-2)
  return tail.join('/') || 'your downloads folder'
}

export function beginDownload(options: chrome.downloads.DownloadOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (id) => {
      const message = chrome.runtime.lastError?.message
      if (message || id == null) reject(new Error(message || 'Chrome did not start the download.'))
      else resolve(id)
    })
  })
}

export function findDownload(id: number): Promise<chrome.downloads.DownloadItem | undefined> {
  return new Promise((resolve) => {
    chrome.downloads.search({ id }, (items) => resolve(items?.[0]))
  })
}

export async function confirmChromeDownload(id: number, timeoutMs: number): Promise<SaveAttempt> {
  const read = async (): Promise<DownloadProbe | null> => {
    const item = await findDownload(id)
    if (!item) return null
    return { state: item.state, error: item.error, filename: item.filename }
  }
  const settle = (item: DownloadProbe | null): SaveAttempt | null => {
    const verdict = judgeDownload(item)
    if (!verdict.done) return null
    return verdict.ok
      ? { ok: true, filename: verdict.filename }
      : { ok: false, error: verdict.error, code: verdict.code }
  }
  const immediate = settle(await read())
  if (immediate) return immediate

  return new Promise((resolve) => {
    let settled = false
    const finish = (attempt: SaveAttempt) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      chrome.downloads.onChanged.removeListener(listener)
      resolve(attempt)
    }
    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== id) return
      if (delta.state?.current !== 'complete' && delta.state?.current !== 'interrupted') return
      void read().then((item) => {
        const attempt = settle(item)
        if (attempt) finish(attempt)
      })
    }
    const timer = setTimeout(() => {
      void read().then((item) => {
        const attempt = settle(item)
        if (attempt) finish(attempt)
        else finish({ ok: false, error: downloadErrorText('TIMEOUT'), code: 'TIMEOUT' })
      })
    }, timeoutMs)
    chrome.downloads.onChanged.addListener(listener)
  })
}
