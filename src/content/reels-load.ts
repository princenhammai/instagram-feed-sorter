import { loadPage } from './api'
import { isRateLimited } from '../lib/batch'
import { humanError } from '../lib/format'
import type { PageBatch } from '../lib/instagram/collect'
import { HttpError } from '../lib/instagram/page-data'

export const REEL_BACKOFF_MS = [0, 15_000, 30_000, 60_000] as const

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    let settled = false
    let timer = 0
    const finish = (error?: DOMException) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => finish(new DOMException('Aborted', 'AbortError'))
    timer = window.setTimeout(() => finish(), ms)
    signal.addEventListener('abort', onAbort)
  })
}

export async function loadReelsPage(
  username: string,
  maxId: string | undefined,
  signal: AbortSignal,
  onWait?: (message: string) => void,
): Promise<PageBatch> {
  let last: unknown
  for (let attempt = 0; attempt < REEL_BACKOFF_MS.length; attempt += 1) {
    const waitMs = REEL_BACKOFF_MS[attempt] ?? 0
    if (waitMs > 0) {
      onWait?.(`Waiting ${Math.round(waitMs / 1000)}s after a rate limit before retrying @${username}`)
      await sleep(waitMs, signal)
    }
    try {
      return await loadPage({ kind: 'reels', username }, maxId)
    } catch (error) {
      last = error
      const status = error instanceof HttpError ? error.status : undefined
      const limited = isRateLimited(humanError(error), status)
      if (signal.aborted || !limited || attempt === REEL_BACKOFF_MS.length - 1) throw error
    }
  }
  throw last instanceof Error ? last : new Error('Instagram did not return Reels.')
}
