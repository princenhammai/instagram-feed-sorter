import { followerCount, followingPage, similarAccounts } from './api'
import { loadReelsPage } from './reels-load'
import { notify, patch } from './store'
import { isRateLimited, reelsUrl } from '../lib/batch'
import { collectPosts } from '../lib/instagram/collect'
import { humanError } from '../lib/format'
import { downloadName, safeSegment } from '../lib/media-files'
import { parseSurface } from '../lib/surface'
import { SYNC_KEY, cleanSync, notionReady, type SummarySyncRow, type SyncSettings } from '../lib/sync'
import {
  SNOWBALL_KEY,
  SNOWBALL_PROGRESS_KEY,
  applyCandidates,
  applyScore,
  isSnowballJob,
  markExpanded,
  pauseSnowball,
  plan,
  progressLabel,
  resumeSnowball,
  snowballAccountTable,
  snowballCsv,
  snowballQueueTable,
  type SnowballJob,
} from '../lib/snowball'
import { buildWorkbook } from '../lib/xlsx'

let snowballBusy = false
let snowballAgain = false
let snowballLeaving = false
let resumeHook: (() => void) | null = null
let signalHook: (() => AbortSignal) | null = null

export function onSnowballResume(resume: () => void, signal: () => AbortSignal): void {
  resumeHook = resume
  signalHook = signal
}

export function kickSnowball(): void {
  resumeHook?.()
}

export function consumeSnowballLeave(): boolean {
  const leaving = snowballLeaving
  snowballLeaving = false
  return leaving
}

export function snowballIsActive(): boolean {
  return snowballBusy
}

function leaveFor(username: string): void {
  snowballLeaving = true
  location.assign(reelsUrl(username))
}

export async function loadSnowball(): Promise<SnowballJob | null> {
  const stored = await chrome.storage.local.get(SNOWBALL_KEY)
  return isSnowballJob(stored[SNOWBALL_KEY]) ? stored[SNOWBALL_KEY] : null
}

async function saveSnowball(job: SnowballJob): Promise<void> {
  await chrome.storage.local.set({
    [SNOWBALL_KEY]: job,
    [SNOWBALL_PROGRESS_KEY]: job.status === 'running' ? progressLabel(job) : '',
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

async function deliver(message: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  return (await chrome.runtime.sendMessage(message)) as { ok?: boolean; error?: string }
}

function syncRows(job: SnowballJob): SummarySyncRow[] {
  const rank = { STRONG: 0, MAYBE: 1, WEAK: 2, ERROR: 3 }
  return [...job.accounts]
    .sort((a, b) => rank[a.grade] - rank[b.grade] || a.username.localeCompare(b.username))
    .map((account) => ({
      account: account.username,
      loaded: account.loaded,
      medianViews: account.medianViews,
      topReel: `https://www.instagram.com/${account.username}/`,
      topViews: null,
      atLeast3x: account.breakouts,
      followers: account.followers,
      note: account.provenance,
      grade: account.grade,
    }))
}

async function exportSnowball(job: SnowballJob): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10)
  const base = downloadName(safeSegment(`snowball-${stamp}`))
  const csv = snowballCsv(job.accounts)
  const csvResult = await deliver({ type: 'DOWNLOAD_TEXT', filename: `${base}.csv`, mime: 'text/csv;charset=utf-8', text: csv })
  const bytes = new Uint8Array(
    await buildWorkbook([
      { name: 'Accounts', rows: snowballAccountTable(job.accounts) },
      { name: 'Queue', rows: snowballQueueTable(job.queue) },
    ]),
  )
  const xlsxResult = await deliver({
    type: 'DOWNLOAD_BYTES',
    filename: `${base}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: bytesToBase64(bytes),
  })
  const stored = await chrome.storage.local.get(SYNC_KEY)
  const sync = cleanSync(stored[SYNC_KEY] as Partial<SyncSettings> | undefined)
  let syncNote = ''
  if (sync.sheets) {
    const sheet = await deliver({ type: 'CREATE_SHEET', title: `Snowball ${stamp}`, csv })
    syncNote += sheet.ok ? ' Opened a Google Sheet.' : ` Sheets: ${sheet.error || 'could not create the sheet.'}`
  }
  if (notionReady(sync)) {
    const notion = await deliver({ type: 'NOTION_SYNC', rows: syncRows(job), delayMs: job.settings.delayMs })
    syncNote += notion.ok ? ' Sent the summary to Notion.' : ` Notion: ${notion.error || 'could not add the rows.'}`
  }
  const problem = [csvResult.ok ? '' : csvResult.error || 'CSV was not saved.', xlsxResult.ok ? '' : xlsxResult.error || 'Excel was not saved.']
    .filter(Boolean)
    .join(' ')
  notify(problem ? `Snowball finished. ${problem}${syncNote}` : `Snowball export saved.${syncNote} ${job.note || ''}`)
}

function pause(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    const timer = window.setTimeout(() => resolve(true), ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      resolve(false)
    }, { once: true })
  })
}

async function runOnce(): Promise<void> {
  const existing = await loadSnowball()
  if (!existing || existing.status !== 'running') return
  const planned = plan(existing)
  await saveSnowball(planned.job)
  if (planned.step.type === 'pause') {
    patch({ phase: { type: 'idle' } })
    notify(planned.step.note || 'Snowball paused.')
    return
  }
  if (planned.step.type === 'done') {
    patch({ phase: { type: 'idle' } })
    await exportSnowball(planned.job)
    return
  }
  const signal = signalHook?.()
  if (!signal) return
  const username = planned.step.username
  if (!username) return

  if (planned.step.type === 'score') {
    const surface = parseSurface(location.href)
    if (surface.kind !== 'reels' || surface.username.toLowerCase() !== username.toLowerCase()) {
      leaveFor(username)
      return
    }
    patch({
      phase: {
        type: 'collecting',
        collected: 0,
        label: `Snowball · @${username}`,
        percent: null,
        scrolling: false,
      },
    })
    if (!(await pause(planned.job.settings.delayMs, signal))) return
    const latest = await loadSnowball()
    if (!latest || latest.status !== 'running') return
    if (signal.aborted) return
    let collectedNow = 0
    const showCollecting = (collected: number, label = `Snowball · @${username}`) => {
      collectedNow = collected
      patch({
        phase: {
          type: 'collecting',
          collected,
          label,
          percent: latest.settings.reelsPerAccount > 0 ? Math.min(100, (collected / latest.settings.reelsPerAccount) * 100) : null,
          scrolling: false,
        },
      })
    }
    let followers: number | null = null
    try {
      const result = await collectPosts({
        limit: latest.settings.reelsPerAccount,
        delayMs: latest.settings.delayMs,
        signal,
        onProgress: (collected) => showCollecting(collected),
        load: (maxId) => loadReelsPage(username, maxId, signal, (message) => showCollecting(collectedNow, message)),
      })
      try {
        followers = await followerCount(username)
      } catch {
        followers = null
      }
      if (signal.aborted || result.stopped) {
        await saveSnowball(pauseSnowball(latest, 'Paused.'))
        patch({ phase: { type: 'idle' } })
        notify('Snowball paused. Resume it from the research panel.')
        return
      }
      if (result.interrupted && isRateLimited(result.interrupted)) {
        await saveSnowball(pauseSnowball(latest, result.interrupted))
        notify(`${result.interrupted} Resume the snowball from the research panel when Instagram has calmed down.`)
        return
      }
      const error = result.posts.length === 0 ? result.interrupted || 'No reels came back. The account may be private.' : undefined
      await saveSnowball(applyScore(latest, { username, followers, posts: result.posts, error }, Date.now()))
      snowballAgain = true
    } catch (error) {
      if (signal.aborted) {
        await saveSnowball(pauseSnowball(latest, 'Paused.'))
        patch({ phase: { type: 'idle' } })
        return
      }
      const message = humanError(error)
      if (isRateLimited(message)) {
        await saveSnowball(pauseSnowball(latest, message))
        notify(`${message} Resume the snowball from the research panel when Instagram has calmed down.`)
        return
      }
      await saveSnowball(applyScore(latest, { username, followers, posts: [], error: message }))
      snowballAgain = true
    }
    return
  }

  const latest = await loadSnowball()
  if (!latest || latest.status !== 'running') return
  const incoming: { username: string; followers: number | null; via: 'suggested' | 'following' }[] = []
  try {
    const suggested = await similarAccounts(username)
    incoming.push(
      ...suggested.slice(0, latest.settings.suggestedCap).map((account) => ({
        username: account.username,
        followers: account.followers,
        via: 'suggested' as const,
      })),
    )
    let maxId: string | undefined
    let loaded = 0
    while (loaded < latest.settings.followingCap && !signal.aborted) {
      if (!(await pause(latest.settings.delayMs, signal))) return
      const page = await followingPage(username, maxId)
      incoming.push(
        ...page.accounts.map((account) => ({
          username: account.username,
          followers: account.followers,
          via: 'following' as const,
        })),
      )
      loaded += page.accounts.length
      if (!page.nextMaxId || page.nextMaxId === maxId || page.accounts.length === 0) break
      maxId = page.nextMaxId
    }
    if (signal.aborted) {
      await saveSnowball(pauseSnowball(latest, 'Paused.'))
      return
    }
    await saveSnowball(markExpanded(applyCandidates(latest, username, incoming), username))
    snowballAgain = true
  } catch (error) {
    const message = humanError(error)
    if (signal.aborted || isRateLimited(message)) {
      await saveSnowball(pauseSnowball(latest, signal.aborted ? 'Paused.' : message))
      if (!signal.aborted) notify(`${message} Resume the snowball from the research panel when Instagram has calmed down.`)
      return
    }
    await saveSnowball(markExpanded(applyCandidates(latest, username, incoming), username))
    snowballAgain = true
    notify(`Could not expand @${username}. ${message}`)
  }
}

export async function resumeSnowballRun(): Promise<void> {
  if (snowballBusy) {
    snowballAgain = true
    return
  }
  snowballBusy = true
  try {
    do {
      snowballAgain = false
      await runOnce()
    } while (snowballAgain)
  } finally {
    snowballBusy = false
  }
}

export async function markSnowballPaused(note?: string): Promise<void> {
  const job = await loadSnowball()
  if (!job || job.status !== 'running') return
  await saveSnowball(pauseSnowball(job, note))
}

export async function markSnowballResumed(): Promise<SnowballJob | null> {
  const job = await loadSnowball()
  if (!job) return null
  const next = resumeSnowball(job)
  await saveSnowball(next)
  return next
}
