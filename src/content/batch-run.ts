import { followerCount, loadPage } from './api'
import { getSnap, notify, patch, type BatchProgress } from './store'
import {
  BATCH_KEY,
  BATCH_PROGRESS_KEY,
  SEEN_KEY,
  accountGroups,
  applyAccountOutcome,
  batchCsv,
  batchFreshTable,
  batchReelTable,
  batchSummaryTable,
  createJob,
  currentHandle,
  isBatchJob,
  isRateLimited,
  mergeSeen,
  pauseJob,
  progressLabel,
  reelsUrl,
  resumeJob,
  seenFromReels,
  seenKeySet,
  summaryChartHtml,
  type AccountDecision,
  type BatchJob,
  type SeenReel,
} from '../lib/batch'
import { collectPosts } from '../lib/instagram/collect'
import { buildWorkbook } from '../lib/xlsx'
import { SYNC_KEY, cleanSync, notionReady, type SummarySyncRow, type SyncSettings } from '../lib/sync'
import { downloadName, safeSegment } from '../lib/media-files'
import { parseSurface } from '../lib/surface'
import { humanError } from '../lib/format'

let batchBusy = false
let batchAgain = false
let batchLeaving = false
let resumeHook: (() => void) | null = null
let signalHook: (() => AbortSignal) | null = null

export function onBatchResume(resume: () => void, signal: () => AbortSignal): void {
  resumeHook = resume
  signalHook = signal
}

export function kickBatch(): void {
  resumeHook?.()
}

export function consumeBatchLeave(): boolean {
  const leaving = batchLeaving
  batchLeaving = false
  return leaving
}

function leaveFor(username: string): void {
  batchLeaving = true
  location.assign(reelsUrl(username))
}

export async function loadJob(): Promise<BatchJob | null> {
  const stored = await chrome.storage.local.get(BATCH_KEY)
  return isBatchJob(stored[BATCH_KEY]) ? stored[BATCH_KEY] : null
}

export async function saveJob(job: BatchJob): Promise<void> {
  await chrome.storage.local.set({ [BATCH_KEY]: job })
}

async function loadSeen(): Promise<SeenReel[]> {
  const stored = await chrome.storage.local.get(SEEN_KEY)
  const value = stored[SEEN_KEY]
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is SeenReel =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as SeenReel).username === 'string' &&
      typeof (item as SeenReel).shortcode === 'string',
  )
}

async function remember(reels: SeenReel[]): Promise<void> {
  if (reels.length === 0) return
  await chrome.storage.local.set({ [SEEN_KEY]: mergeSeen(await loadSeen(), reels) })
}

async function saveProgress(progress: BatchProgress | null): Promise<void> {
  patch({ batch: progress })
  if (progress) await chrome.storage.local.set({ [BATCH_PROGRESS_KEY]: progress })
  else await chrome.storage.local.remove(BATCH_PROGRESS_KEY)
}

export async function queueBatch(handles: string[], reelsPerAccount: number, delayMs: number): Promise<string> {
  const job = createJob(handles, reelsPerAccount, delayMs)
  await saveJob(job)
  await saveProgress(progressLabel(job, 0))
  return reelsUrl(handles[0] || '')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

async function deliver(message: Record<string, unknown>): Promise<{ ok?: boolean; error?: string; filename?: string }> {
  return (await chrome.runtime.sendMessage(message)) as { ok?: boolean; error?: string; filename?: string }
}

function summaryRows(job: BatchJob): SummarySyncRow[] {
  return accountGroups(job).map((group) => ({
    account: group.summary.username,
    loaded: group.summary.loaded,
    medianViews: group.summary.medianViews,
    topReel: group.summary.topPermalink,
    topViews: group.summary.topViews,
    atLeast3x: group.summary.atLeast3x,
    followers: group.summary.followers,
  }))
}

async function exportJob(job: BatchJob): Promise<void> {
  const groups = accountGroups(job)
  const stamp = new Date().toISOString().slice(0, 10)
  const base = downloadName(safeSegment(`batch-reels-${stamp}`))
  const csv = batchCsv(groups)
  const csvResult = await deliver({
    type: 'DOWNLOAD_TEXT',
    filename: `${base}.csv`,
    mime: 'text/csv;charset=utf-8',
    text: csv,
  })
  const bytes = new Uint8Array(await buildWorkbook([
    { name: 'Reels', rows: batchReelTable(groups) },
    { name: 'New reels', rows: batchFreshTable(groups) },
    { name: 'Summary', rows: batchSummaryTable(groups.map((group) => group.summary)) },
  ]))
  const xlsxResult = await deliver({
    type: 'DOWNLOAD_BYTES',
    filename: `${base}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: bytesToBase64(bytes),
  })
  const chartResult = await deliver({
    type: 'DOWNLOAD_TEXT',
    filename: `${base}-summary.html`,
    mime: 'text/html;charset=utf-8',
    text: summaryChartHtml(groups.map((group) => group.summary)),
  })
  const stored = await chrome.storage.local.get(SYNC_KEY)
  const sync = cleanSync(stored[SYNC_KEY] as Partial<SyncSettings> | undefined)
  let syncNote = ''
  if (sync.sheets) {
    const sheet = await deliver({ type: 'CREATE_SHEET', title: `Batch reels ${stamp}`, csv })
    syncNote += sheet.ok ? ' Opened a Google Sheet.' : ` Sheets: ${sheet.error || 'could not create the sheet.'}`
  }
  if (notionReady(sync)) {
    const notion = await deliver({ type: 'NOTION_SYNC', rows: summaryRows(job), delayMs: job.delayMs })
    syncNote += notion.ok ? ' Sent the summary to Notion.' : ` Notion: ${notion.error || 'could not add the rows.'}`
  }
  const problem = [
    csvResult.ok ? '' : csvResult.error || 'CSV was not saved.',
    xlsxResult.ok ? '' : xlsxResult.error || 'Excel was not saved.',
    chartResult.ok ? '' : chartResult.error || 'The summary chart was not saved.',
  ]
    .filter(Boolean)
    .join(' ')
  notify(problem ? `Batch finished. ${problem}${syncNote}` : `Batch export saved for ${job.handles.length} accounts.${syncNote}`)
}

async function runOnce(): Promise<void> {
  const existing = await loadJob()
  if (!existing || existing.status !== 'running') {
    if (existing?.status !== 'running') patch({ batch: null })
    return
  }
  const handle = currentHandle(existing)
  if (!handle) {
    await saveJob({ ...existing, status: 'done', updatedAt: Date.now() })
    await saveProgress(null)
    await exportJob(existing)
    return
  }
  const surface = parseSurface(location.href)
  if (surface.kind !== 'reels' || surface.username.toLowerCase() !== handle.toLowerCase()) {
    leaveFor(handle)
    return
  }
  const signal = signalHook?.()
  if (!signal) return
  patch({
    phase: {
      type: 'collecting',
      collected: 0,
      label: `${existing.index + 1}/${existing.handles.length} · @${handle}`,
      percent: null,
      scrolling: false,
    },
    batch: progressLabel(existing, 0),
  })
  await saveProgress(progressLabel(existing, 0))
  if (!(await pause(existing.delayMs, signal))) return
  const latest = await loadJob()
  if (!latest || latest.status !== 'running') return

  const known = seenKeySet(await loadSeen())
  let followers: number | null = null
  try {
    followers = await followerCount(handle)
  } catch (error) {
    const message = humanError(error)
    if (isRateLimited(message)) {
      await settle(applyAccountOutcome(latest, handle, { followers: null, posts: [], thrown: message }, known))
      return
    }
    followers = null
  }
  if (signal.aborted) return

  try {
    const result = await collectPosts({
      limit: latest.reelsPerAccount,
      delayMs: latest.delayMs,
      signal,
      onProgress: (collected) => {
        const progress = progressLabel(latest, collected)
        patch({
          phase: {
            type: 'collecting',
            collected,
            label: `${latest.index + 1}/${latest.handles.length} · @${handle}`,
            percent: Math.min(100, (collected / latest.reelsPerAccount) * 100),
            scrolling: false,
          },
          batch: progress,
        })
      },
      load: (maxId) => loadPage({ kind: 'reels', username: handle }, maxId),
    })
    const fresh = await loadJob()
    await settle(
      applyAccountOutcome(
        fresh && fresh.status === 'running' ? fresh : latest,
        handle,
        {
          followers,
          posts: result.posts,
          interrupted: result.interrupted,
          stopped: result.stopped,
          aborted: signal.aborted,
        },
        known,
      ),
    )
  } catch (error) {
    const message = signal.aborted ? '' : humanError(error)
    await settle(
      applyAccountOutcome(latest, handle, { followers, posts: [], aborted: signal.aborted, thrown: message }, known),
    )
  }
}

async function settle(decision: AccountDecision): Promise<void> {
  await saveJob(decision.job)
  if (decision.type === 'pause') {
    patch({ phase: { type: 'idle' }, batch: null })
    await saveProgress(null)
    const calm = decision.message !== 'Paused.'
    notify(
      calm
        ? `${decision.message} Resume the batch from the popup when Instagram has calmed down.`
        : 'Batch paused. Resume it from the extension popup.',
    )
    return
  }
  const account = decision.job.accounts[decision.job.accounts.length - 1]
  if (account?.status === 'done') await remember(seenFromReels(account.reels))
  if (decision.job.status === 'done') {
    patch({ phase: { type: 'idle' }, batch: null })
    await saveProgress(null)
    await exportJob(decision.job)
    return
  }
  const upcoming = currentHandle(decision.job)
  if (upcoming) leaveFor(upcoming)
}

function pause(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    const timer = window.setTimeout(() => resolve(true), ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve(false)
      },
      { once: true },
    )
  })
}

export async function resumeBatch(): Promise<void> {
  if (batchBusy) {
    batchAgain = true
    return
  }
  batchBusy = true
  try {
    do {
      batchAgain = false
      await runOnce()
    } while (batchAgain)
  } finally {
    batchBusy = false
  }
}

export async function markPaused(note?: string): Promise<void> {
  const job = await loadJob()
  if (!job || job.status !== 'running') return
  await saveJob(pauseJob(job, note))
  await saveProgress(null)
  patch({ batch: null })
}

export async function markResumed(): Promise<BatchJob | null> {
  const job = await loadJob()
  if (!job) return null
  const next = resumeJob(job)
  await saveJob(next)
  return next
}

export function batchIsActive(): boolean {
  return batchBusy || getSnap().batch != null
}
