import { enrichPost, hasPlayableVideo, loadPage, mediaByShortcode, resetReelsSource, similarAccounts, storyPosts } from './api'
import { callMain } from './bridge'
import { downloadToFolder, pickFolder } from './downloads'
import { CLOSED_SIMILAR, getSnap, notify, patch, type DownloadState } from './store'
import type { Folder } from '../lib/db'
import { collectPosts } from '../lib/instagram/collect'
import { exportColumns, objectsToTable, sortableName, table, tableToCsv, tableToJson, tableToTsv, toCsv, toJson, toTsv } from '../lib/export'
import { humanError } from '../lib/format'
import { headline } from '../lib/headline'
import { downloadName, filesForPost, safeSegment, zipStem, type RemoteFile } from '../lib/media-files'
import { buildReelExport } from '../lib/reel-export'
import { withEngagement, withOutlierScores } from '../lib/outlier'
import { isRateLimit } from '../lib/instagram/page-data'
import { rangeError, resolveRange } from '../lib/range'
import { dateFilterAllowed, isSortable, outlierAllowed, parseSurface, sortBlockReason } from '../lib/surface'
import { loadSettings } from '../lib/settings'
import { buildXlsx } from '../lib/xlsx'
import {
  DATE_PRESETS,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SORT_KEYS,
  type Post,
  type RangeChoice,
  type Settings,
  type SortableSurface,
  type SortKey,
  type Surface,
} from '../lib/types'

let runToken = 0
let collectAbort: AbortController | null = null
let downloadAbort: AbortController | null = null
const lookedUp = new Set<string>()

const SORTS: SortKey[] = SORT_KEYS
const PENDING_KEY = 'ifs-pending-sort'
const IDLE_ROUNDS = 6
const MEDIA_WIDTH = 3
const MEDIA_GAP_MS = 140

function isRange(value: unknown): value is RangeChoice {
  if (!value || typeof value !== 'object') return false
  const choice = value as RangeChoice
  const countOk = choice.count === 'all' || (typeof choice.count === 'number' && Number.isFinite(choice.count))
  return countOk && (DATE_PRESETS as readonly string[]).includes(choice.date)
}

function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && SORTS.includes(value as SortKey)
}

export function invalidate(): void {
  runToken += 1
  collectAbort?.abort()
  stopMediaReads()
}

export function init(): void {
  patch({ href: location.href })
  void loadSettings().then((settings) => patch({ settings }))
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return
    patch({ settings: { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue as Partial<Settings>) } })
  })
  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data as { source?: string; type?: string }
    if (data?.source === 'ifs-main' && data.type === 'NAV') onNavigate()
  })
  window.setInterval(() => {
    if (location.href !== getSnap().href) onNavigate()
  }, 800)
  resumePendingSort()
}

export function onNavigate(): void {
  const href = location.href
  if (href === getSnap().href) return
  const wasOpen = getSnap().phase.type !== 'idle'
  invalidate()
  patch({ href, phase: { type: 'idle' }, similar: CLOSED_SIMILAR })
  if (wasOpen) notify('Closed the sorted grid because this tab opened another Instagram page.')
}

export function closeOverlay(): void {
  invalidate()
  patch({ phase: { type: 'idle' }, similar: CLOSED_SIMILAR })
}

export function stopCollect(): void {
  collectAbort?.abort()
}

export async function startSort(choice: RangeChoice, sortKey: SortKey): Promise<{ ok: boolean; error?: string }> {
  const surface = parseSurface(location.href)
  if (!isSortable(surface)) {
    return { ok: false, error: rangeError(surface, choice) || 'This page cannot be sorted.' }
  }
  const blocked = sortBlockReason(surface, sortKey) || rangeError(surface, choice)
  if (blocked) return { ok: false, error: blocked }

  collectAbort?.abort()
  if (surface.kind === 'reels') resetReelsSource(surface.username)
  const token = ++runToken
  const controller = new AbortController()
  collectAbort = controller
  const label = `Collecting ${headline(surface, choice)}`
  patch({
    phase: { type: 'collecting', collected: 0, label, percent: null, scrolling: false },
    similar: CLOSED_SIMILAR,
  })

  try {
    const resolved = resolveRange(choice)
    const result = await collectPosts({
      limit: resolved.limit,
      start: dateFilterAllowed(surface) ? resolved.start : undefined,
      end: dateFilterAllowed(surface) ? resolved.end : undefined,
      signal: controller.signal,
      onProgress: (collected) => {
        if (token !== runToken) return
        patch({ phase: { type: 'collecting', collected, label, percent: null, scrolling: false } })
      },
      load: (maxId) => loadPage(surface, maxId),
    })
    if (token !== runToken) return { ok: true }
    if (result.posts.length === 0) {
      const message = result.stopped
        ? 'Sort stopped before any posts came back.'
        : 'Nothing came back for that range. Try a larger number, or refresh and sign in again.'
      patch({ phase: { type: 'error', message } })
      return { ok: false, error: message }
    }
    await showResults(token, surface, result.posts, choice, sortKey, result.capped)
    if (result.stopped) notify('Stopped early. Showing the posts already collected.')
    else if (result.interrupted) {
      notify(`Instagram stopped answering after ${result.posts.length} posts, so the grid shows those. ${result.interrupted}`)
    }
    return { ok: true }
  } catch (error) {
    if (token !== runToken) return { ok: true }
    const message = humanError(error)
    patch({ phase: { type: 'error', message } })
    return { ok: false, error: message }
  }
}

async function followerCount(surface: SortableSurface, posts: Post[]): Promise<number | null> {
  if (surface.kind !== 'posts' && surface.kind !== 'reels') return null
  if (posts.every((post) => post.views != null && post.views > 0)) return null
  try {
    const count = await callMain({ action: 'followers', username: surface.username }, 15_000)
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

async function showResults(
  token: number,
  surface: SortableSurface,
  collected: Post[],
  choice: RangeChoice,
  sortKey: SortKey,
  capped: boolean,
): Promise<void> {
  const followers = await followerCount(surface, collected)
  if (token !== runToken) return
  const hasViews = collected.some((post) => post.views != null)
  const metric = outlierAllowed(surface) ? (surface.kind === 'reels' || hasViews ? 'views' : 'likes') : null
  const posts = withEngagement(withOutlierScores(collected, metric), followers)
  const warning =
    sortKey === 'outlier' && posts.every((post) => post.outlierScore == null)
      ? 'Not enough posts older than 3 days to score outliers.'
      : null
  patch({
    phase: {
      type: 'ready',
      runId: token,
      model: { surface, posts, sortKey, range: choice, capped, warning },
    },
  })
  warmMedia(posts)
}

function validateSort(choice: RangeChoice, sortKey: SortKey): string | null {
  const surface = parseSurface(location.href)
  if (!isSortable(surface)) return rangeError(surface, choice) || 'This page cannot be sorted.'
  return sortBlockReason(surface, sortKey) || rangeError(surface, choice)
}

interface PendingSort {
  surface: string
  range: RangeChoice
  sortKey: SortKey
  at: number
}

export function requestSort(choice: RangeChoice, sortKey: SortKey): { ok: boolean; error?: string } {
  const problem = validateSort(choice, sortKey)
  if (problem) return { ok: false, error: problem }
  const pending: PendingSort = {
    surface: JSON.stringify(parseSurface(location.href)),
    range: choice,
    sortKey,
    at: Date.now(),
  }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  invalidate()
  patch({
    phase: { type: 'collecting', collected: 0, label: 'Opening the profile again', percent: null, scrolling: true },
    similar: CLOSED_SIMILAR,
  })
  window.setTimeout(() => location.reload(), 200)
  return { ok: true }
}

export function resumePendingSort(): void {
  const raw = sessionStorage.getItem(PENDING_KEY)
  if (!raw) return
  sessionStorage.removeItem(PENDING_KEY)
  let pending: PendingSort
  try {
    pending = JSON.parse(raw) as PendingSort
  } catch {
    return
  }
  if (Date.now() - pending.at > 60_000) return
  if (pending.surface !== JSON.stringify(parseSurface(location.href))) return
  if (!isRange(pending.range) || !isSortKey(pending.sortKey)) return
  void captureSort(pending.range, pending.sortKey)
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

function relevantPosts(surface: SortableSurface, posts: Post[]): Post[] {
  if (surface.kind !== 'posts' && surface.kind !== 'reels') return posts
  const want = surface.username.toLowerCase()
  return posts.filter((post) => {
    if (post.username.toLowerCase() !== want) return false
    return surface.kind === 'posts' || post.mediaKind === 'video'
  })
}

function nudgeScroll(idleRounds: number): void {
  const page = document.scrollingElement || document.documentElement
  if (idleRounds > 0 && idleRounds % 2 === 0) window.scrollBy(0, -900)
  window.scrollTo(0, page.scrollHeight)
}

async function captureSort(choice: RangeChoice, sortKey: SortKey): Promise<void> {
  const surface = parseSurface(location.href)
  if (!isSortable(surface)) return
  collectAbort?.abort()
  const token = ++runToken
  const controller = new AbortController()
  collectAbort = controller
  const resolved = resolveRange(choice)
  const dated = dateFilterAllowed(surface) && resolved.start != null
  const start = resolved.start ?? 0
  const end = resolved.end ?? Number.POSITIVE_INFINITY
  const noun = surface.kind === 'reels' ? 'Reels' : 'posts'
  const show = (collected: number, percent: number | null, label: string) => {
    if (token !== runToken) return
    patch({ phase: { type: 'collecting', collected, label, percent, scrolling: true }, similar: CLOSED_SIMILAR })
  }

  show(0, null, 'Reading this profile')
  await pause(700, controller.signal)

  let all: Post[] = []
  let wanted: Post[] = []
  let lastCount = -1
  let idle = 0
  let failed = false
  for (;;) {
    if (controller.signal.aborted || token !== runToken) break
    try {
      all = relevantPosts(surface, (await callMain({ action: 'captured' })) as Post[])
    } catch {
      failed = true
      break
    }
    wanted = dated ? all.filter((post) => post.takenAt >= start && post.takenAt <= end) : all
    const reachedStart = dated && all.filter((post) => post.takenAt > 0 && post.takenAt < start).length >= 3
    let percent: number | null
    if (dated) {
      const oldest = Math.min(...all.map((post) => post.takenAt || Date.now()), Date.now())
      percent = reachedStart ? 100 : Math.min(99, ((Date.now() - oldest) / Math.max(1, Date.now() - start)) * 100)
    } else if (choice.count === 'all') {
      percent = null
    } else {
      percent = Math.min(100, (wanted.length / resolved.limit) * 100)
    }
    show(Math.min(wanted.length, resolved.limit), percent, `${Math.min(wanted.length, resolved.limit)} ${noun} found. Leave this tab in front.`)
    if (wanted.length >= resolved.limit || reachedStart) break
    idle = wanted.length === lastCount ? idle + 1 : 0
    lastCount = wanted.length
    if (idle >= IDLE_ROUNDS) break
    nudgeScroll(idle)
    if (!(await pause(idle === 0 ? 700 : 1000, controller.signal))) break
  }

  window.scrollTo(0, 0)
  if (token !== runToken) return
  if (failed || wanted.length === 0) {
    if (controller.signal.aborted && !failed) {
      patch({ phase: { type: 'error', message: 'Sort stopped before any posts came back.' } })
      return
    }
    await startSort(choice, sortKey)
    return
  }
  const latest = [...wanted].sort((a, b) => b.takenAt - a.takenAt).slice(0, resolved.limit)
  const capped = choice.count === 'all' && wanted.length >= resolved.limit
  await showResults(token, surface, latest, choice, sortKey, capped)
  if (controller.signal.aborted) notify('Stopped early. Showing the posts already collected.')
}

export function sortSimilar(username: string, choice: RangeChoice, sortKey: SortKey): void {
  const surface: SortableSurface = { kind: 'reels', username }
  const pending: PendingSort = {
    surface: JSON.stringify(surface),
    range: choice,
    sortKey: sortBlockReason(surface, sortKey) ? 'views' : sortKey,
    at: Date.now(),
  }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  invalidate()
  location.assign(`https://www.instagram.com/${encodeURIComponent(username)}/reels/`)
}

async function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>
}

function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function downloadLabel(done: number, total: number, label = 'Downloading'): DownloadState {
  return { done, total, label }
}

function rememberPost(post: Post): void {
  const snap = getSnap()
  if (snap.phase.type !== 'ready') return
  patch({
    phase: {
      ...snap.phase,
      model: {
        ...snap.phase.model,
        posts: snap.phase.model.posts.map((item) => (item.id === post.id ? post : item)),
      },
    },
  })
}

function needsLookup(post: Post): boolean {
  if (lookedUp.has(post.id)) return false
  if (post.mediaKind === 'video') return !hasPlayableVideo(post) || post.duration == null || post.caption === ''
  if (post.mediaKind === 'carousel') return post.slides.length === 0 || post.caption === ''
  return false
}

let mediaAbort = new AbortController()
let mediaActive = 0
let mediaNextStart = 0
let mediaCalmUntil = 0
const mediaSlots: Array<() => void> = []
const mediaInflight = new Map<string, Promise<Post>>()

function stopMediaReads(): void {
  mediaAbort.abort()
  mediaAbort = new AbortController()
  mediaNextStart = 0
  mediaCalmUntil = 0
}

function takeMediaSlot(): Promise<void> {
  if (mediaActive < MEDIA_WIDTH) {
    mediaActive += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    mediaSlots.push(() => {
      mediaActive += 1
      resolve()
    })
  })
}

function freeMediaSlot(): void {
  mediaActive = Math.max(0, mediaActive - 1)
  const next = mediaSlots.shift()
  if (next) next()
}

function aborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function loadOne(post: Post): Promise<Post> {
  if (!needsLookup(post)) return post
  const existing = mediaInflight.get(post.id)
  if (existing) return existing
  const job = runLookup(post)
  mediaInflight.set(post.id, job)
  try {
    return await job
  } finally {
    if (mediaInflight.get(post.id) === job) mediaInflight.delete(post.id)
  }
}

async function runLookup(post: Post): Promise<Post> {
  const signal = mediaAbort.signal
  await takeMediaSlot()
  try {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const now = Date.now()
    const at = Math.max(now, mediaNextStart, mediaCalmUntil)
    mediaNextStart = at + MEDIA_GAP_MS
    if (at > now && !(await pause(at - now, signal))) throw new DOMException('Aborted', 'AbortError')
    const next = await enrichPost(post)
    lookedUp.add(post.id)
    rememberPost(next)
    return next
  } catch (error) {
    if (isRateLimit(error)) mediaCalmUntil = Math.max(mediaCalmUntil, Date.now() + 3000)
    throw error
  } finally {
    freeMediaSlot()
  }
}

function warmMedia(posts: Post[]): void {
  const pending = posts.filter(needsLookup).slice(0, 60)
  for (const post of pending) void loadOne(post).catch(() => undefined)
}

async function withRealMedia(posts: Post[], signal: AbortSignal, label: string): Promise<Post[] | null> {
  const ready = posts.slice()
  let done = 0
  let singleError: unknown = null
  let opened = false
  const report = () => {
    if (signal.aborted) return
    const current = getSnap().download
    if (!opened) {
      if (current && current.label !== label) return
      opened = true
    } else if (!current || current.label !== label) {
      return
    }
    patch({ download: downloadLabel(done, posts.length, label) })
  }
  report()
  const jobs = posts.map(async (post, index) => {
    if (signal.aborted) return
    try {
      ready[index] = await loadOne(post)
    } catch (error) {
      if (signal.aborted || aborted(error)) return
      if (posts.length === 1) {
        singleError = error
        return
      }
      ready[index] = post
    }
    if (signal.aborted) return
    done += 1
    report()
  })
  await Promise.race([
    Promise.all(jobs),
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve()
        return
      }
      signal.addEventListener('abort', () => resolve(), { once: true })
    }),
  ])
  if (signal.aborted) return null
  if (singleError) throw singleError
  return ready
}

export async function ensureVideo(post: Post): Promise<Post> {
  return loadOne(post)
}

async function zipDownload(surface: Surface, entries: RemoteFile[]): Promise<void> {
  patch({ download: downloadLabel(0, entries.length) })
  const response = await send<{ ok: boolean; error?: string; saved?: number; failed?: number; stopped?: boolean }>({
    type: 'DOWNLOAD_ZIP',
    filename: downloadName(`${safeSegment(zipStem(surface))}.zip`),
    entries,
  })
  patch({ download: null })
  if (!response?.ok) {
    notify(response?.error || 'Download failed.')
    return
  }
  const failed = response.failed ? ` ${response.failed} could not be fetched.` : ''
  notify(response.stopped ? `Stopped. Saved ${response.saved ?? 0} files.${failed}` : `Zip ready.${failed}`)
}

export async function downloadPosts(surface: Surface, posts: Post[]): Promise<void> {
  if (posts.length === 0) {
    notify('Nothing to download.')
    return
  }
  if (getSnap().download) {
    notify('A download is already running.')
    return
  }
  const controller = new AbortController()
  downloadAbort = controller
  try {
    const ready = await withRealMedia(posts, controller.signal, 'Getting video')
    if (!ready) {
      downloadAbort = null
      patch({ download: null })
      notify('Download stopped.')
      return
    }
    const entries = ready.flatMap((post, index) => filesForPost(post, ready.length > 1 ? index : undefined))
    const skipped = ready.filter((post) => filesForPost(post).length === 0).length
    const skippedNote = skipped ? ` ${skipped} had no video file and were skipped.` : ''
    if (entries.length === 0) {
      downloadAbort = null
      patch({ download: null })
      notify('Instagram did not return video files for these reels. Refresh the page and try again.')
      return
    }
    if (entries.length === 1) {
      downloadAbort = null
      patch({ download: null })
      const file = entries[0]
      const response = await send<{ ok: boolean; error?: string }>({
        type: 'DOWNLOAD_URL',
        url: file.url,
        filename: downloadName(file.name),
        saveAs: true,
      })
      notify(response?.ok ? `Download started.${skippedNote}` : response?.error || 'Download failed.')
      return
    }

    const picked = await pickFolder()
    if (picked.type === 'cancelled') {
      downloadAbort = null
      patch({ download: null })
      return
    }
    if (picked.type === 'unavailable') {
      await zipDownload(surface, entries)
      downloadAbort = null
      return
    }

    const subfolder = safeSegment(zipStem(surface))
    patch({ download: downloadLabel(0, entries.length) })
    const result = await downloadToFolder(picked.dir, subfolder, entries, controller.signal, (done, total) =>
      setDownloadProgress(done, total),
    )
    downloadAbort = null
    patch({ download: null })

    for (const file of result.stopped ? [] : result.failed) {
      await send({ type: 'DOWNLOAD_URL', url: file.url, filename: downloadName(`${subfolder}/${file.name}`) }).catch(
        () => undefined,
      )
    }
    const where = `${picked.dir.name}/${subfolder}`
    const orderNote = ' Files are numbered in the current sort order.'
    if (result.stopped) notify(`Stopped. Saved ${result.saved} of ${entries.length} videos to ${where}.${skippedNote}`)
    else if (result.failed.length > 0) {
      notify(
        `Saved ${result.saved} videos to ${where}.${orderNote} ${result.failed.length} were handed to Chrome downloads instead.${skippedNote}`,
      )
    } else notify(`Saved ${result.saved} videos to ${where}.${orderNote}${skippedNote}`)
  } catch (error) {
    downloadAbort = null
    patch({ download: null })
    notify(humanError(error))
  }
}

export function cancelDownload(): void {
  downloadAbort?.abort()
  stopMediaReads()
  void chrome.runtime.sendMessage({ type: 'CANCEL_ZIP' })
}

export function setDownloadProgress(done: number, total: number): void {
  const current = getSnap().download
  if (!current) return
  patch({ download: { ...current, done, total } })
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // The page clipboard can be blocked. Fall through to a selection copy.
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', 'true')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error('Could not copy those rows.')
}

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'sheets' | 'clipboard'

async function publishSheet(title: string, csv: string, tsv: string): Promise<void> {
  notify('Creating the Google Sheet…')
  try {
    const response = await send<{ ok?: boolean; url?: string; error?: string }>({ type: 'CREATE_SHEET', title, csv })
    if (response?.ok) {
      notify('Opened a Google Sheet with these rows filled in.')
      return
    }
    await copyText(tsv)
    await send({ type: 'OPEN_SHEETS' })
    notify(
      `${response?.error || 'Google did not accept the sheet.'} The rows are copied — click cell A1 and paste (⌘V or Ctrl+V).`,
    )
  } catch (error) {
    try {
      await copyText(tsv)
      await send({ type: 'OPEN_SHEETS' })
    } catch {
      // The message below still tells the user what happened.
    }
    notify(`${humanError(error)} The rows are copied if the sheet is open — click cell A1 and paste.`)
  }
}

export async function exportPosts(surface: Surface, posts: Post[], format: ExportFormat): Promise<void> {
  if (posts.length === 0) {
    notify('Nothing to export.')
    return
  }
  if (getSnap().download) {
    notify('Wait for the current download to finish.')
    return
  }
  const columns = exportColumns()
  const base = downloadName(safeSegment(zipStem(surface)))
  const controller = new AbortController()
  downloadAbort = controller
  try {
    const ready = await withRealMedia(posts, controller.signal, 'Reading reel')
    downloadAbort = null
    patch({ download: null })
    if (!ready) {
      notify('Export stopped.')
      return
    }
    posts = ready
    if (format === 'clipboard') {
      await copyText(toTsv(columns, posts))
      notify(`Copied ${posts.length} rows.`)
      return
    }
    if (format === 'sheets') {
      await publishSheet(sortableName(isSortable(surface) ? surface : { kind: 'posts', username: 'instagram' }), toCsv(columns, posts), toTsv(columns, posts))
      return
    }
    if (format === 'csv') {
      await send({ type: 'DOWNLOAD_TEXT', filename: `${base}.csv`, mime: 'text/csv;charset=utf-8', text: toCsv(columns, posts) })
    } else if (format === 'json') {
      await send({
        type: 'DOWNLOAD_TEXT',
        filename: `${base}.json`,
        mime: 'application/json',
        text: toJson(columns, posts),
      })
    } else {
      const sheet = sortableName(isSortable(surface) ? surface : { kind: 'posts', username: 'instagram' })
      const bytes = await buildXlsx(sheet, table(columns, posts))
      await send({
        type: 'DOWNLOAD_BYTES',
        filename: `${base}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: base64Of(bytes),
      })
    }
    notify(`Exported ${posts.length} rows, including video links, captions, and durations.`)
  } catch (error) {
    downloadAbort = null
    patch({ download: null })
    notify(humanError(error))
  }
}

const SORT_FIRST = 'Sort the profile first'
let exportUsername = ''
let exportPostsInOrder: Post[] = []

export function registerReelExport(username: string, posts: Post[]): void {
  exportUsername = username
  exportPostsInOrder = posts
}

export type ReelExportKind = 'csv' | 'xlsx' | 'json' | 'copy' | 'download'

export async function exportCapturedReels(
  posts: Post[],
  username: string,
  includeAds: boolean,
  mode: ReelExportKind,
): Promise<{ ok: boolean; error?: string; tsv?: string }> {
  if (posts.length === 0) {
    notify(SORT_FIRST)
    return { ok: false, error: SORT_FIRST }
  }
  const built = buildReelExport(posts, { includeAds, username: username || posts[0]?.username || 'profile', now: new Date() })
  if (built.rows === 0) {
    notify(SORT_FIRST)
    return { ok: false, error: SORT_FIRST }
  }
  const kind = mode === 'download' ? 'csv' : mode
  if (kind === 'copy') {
    try {
      await copyText(built.tsv)
    } catch (error) {
      return { ok: false, error: humanError(error), tsv: built.tsv }
    }
    notify(`Copied ${built.rows} rows.`)
    return { ok: true, tsv: built.tsv }
  }
  const stem = built.filename.replace(/\.csv$/, '')
  try {
    if (kind === 'json') {
      await send({ type: 'DOWNLOAD_TEXT', filename: downloadName(`${stem}.json`), mime: 'application/json', text: built.json })
    } else if (kind === 'xlsx') {
      const bytes = await buildXlsx('Reels', built.sheet)
      await send({
        type: 'DOWNLOAD_BYTES',
        filename: downloadName(`${stem}.xlsx`),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: base64Of(bytes),
      })
    } else {
      await send({ type: 'DOWNLOAD_TEXT', filename: downloadName(built.filename), mime: 'text/csv;charset=utf-8', text: built.csv })
    }
  } catch (error) {
    notify(humanError(error))
    return { ok: false, error: humanError(error) }
  }
  notify(`Exported ${built.rows} reels.`)
  return { ok: true }
}

export async function openSimilar(username: string): Promise<void> {
  patch({ similar: { open: true, loading: true, accounts: [], error: null } })
  try {
    const accounts = await similarAccounts(username)
    patch({
      similar: {
        open: true,
        loading: false,
        accounts,
        error: accounts.length === 0 ? 'Instagram did not suggest any similar accounts.' : null,
      },
    })
  } catch (error) {
    patch({ similar: { open: true, loading: false, accounts: [], error: humanError(error) } })
  }
}

export function closeSimilar(): void {
  patch({ similar: CLOSED_SIMILAR })
}

export async function exportSimilar(
  username: string,
  format: 'csv' | 'json' | 'xlsx' | 'sheets' | 'clipboard',
): Promise<void> {
  const rows = getSnap().similar.accounts.map((account) => ({
    Username: account.username,
    'Full name': account.fullName,
    Profile: account.url,
    Followers: account.followers,
    Verified: account.verified ? 'Yes' : 'No',
    Private: account.isPrivate ? 'Yes' : 'No',
    Category: account.category,
    'User ID': /^\d+$/.test(account.id) ? account.id : '',
    'Avatar URL': account.avatarUrl,
  }))
  const tableRows = objectsToTable(rows)
  const base = downloadName(`${safeSegment(username)}-similar`)
  try {
    if (format === 'clipboard') {
      await copyText(tableToTsv(tableRows))
      notify(`Copied ${rows.length} accounts.`)
      return
    }
    if (format === 'sheets') {
      await publishSheet(`${username} similar accounts`, tableToCsv(tableRows), tableToTsv(tableRows))
      return
    }
    if (format === 'csv') {
      await send({ type: 'DOWNLOAD_TEXT', filename: `${base}.csv`, mime: 'text/csv;charset=utf-8', text: tableToCsv(tableRows) })
    } else if (format === 'json') {
      await send({ type: 'DOWNLOAD_TEXT', filename: `${base}.json`, mime: 'application/json', text: tableToJson(tableRows) })
    } else {
      const bytes = await buildXlsx('Similar', tableRows)
      await send({
        type: 'DOWNLOAD_BYTES',
        filename: `${base}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: base64Of(bytes),
      })
    }
    notify(`Exported ${rows.length} similar accounts.`)
  } catch (error) {
    notify(humanError(error))
  }
}

export function openInstagram(url: string, active: boolean): void {
  void chrome.runtime.sendMessage({ type: 'OPEN_TAB', url, active })
}

export async function savePost(post: Post, folder?: Folder): Promise<void> {
  notify('Saving…')
  try {
    const response = await send<{ ok: boolean; error?: string; warning?: string }>({
      type: 'SAVE_POST',
      post,
      folderId: folder?.id,
    })
    const where = folder ? `“${folder.name}”` : 'your library'
    notify(response?.ok ? response.warning || `Saved to ${where}.` : response?.error || 'Could not save that post.')
  } catch (error) {
    notify(humanError(error))
  }
}

export async function savePosts(posts: Post[], folder: Folder): Promise<void> {
  let saved = 0
  let failed = 0
  for (const [index, post] of posts.entries()) {
    notify(`Saving ${index + 1} of ${posts.length} to “${folder.name}”…`)
    try {
      const response = await send<{ ok: boolean }>({ type: 'SAVE_POST', post, folderId: folder.id })
      if (response?.ok) saved += 1
      else failed += 1
    } catch {
      failed += 1
    }
  }
  notify(`Saved ${saved} posts to “${folder.name}”.${failed ? ` ${failed} failed.` : ''}`)
}

export async function listFolders(): Promise<Folder[]> {
  const response = await send<{ ok: boolean; folders?: Folder[] }>({ type: 'LIST_FOLDERS' })
  return response?.folders ?? []
}

export async function createFolder(name: string): Promise<Folder | null> {
  const response = await send<{ ok: boolean; folder?: Folder; error?: string }>({ type: 'CREATE_FOLDER', name })
  if (!response?.ok || !response.folder) {
    notify(response?.error || 'Could not create that folder.')
    return null
  }
  return response.folder
}

export async function transcribePost(post: Post, force = false): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    return await send<{ ok: boolean; text?: string; error?: string }>({ type: 'TRANSCRIBE', post, force })
  } catch (error) {
    return { ok: false, error: humanError(error) }
  }
}

export async function downloadCurrent(): Promise<{ ok: boolean; error?: string }> {
  const surface = parseSurface(location.href)
  try {
    if (surface.kind === 'post') {
      const post = await mediaByShortcode(surface.shortcode)
      if (!post) return { ok: false, error: 'Could not read that post. Refresh and try again.' }
      await downloadPosts(surface, [post])
      return { ok: true }
    }
    if (surface.kind === 'stories') {
      const posts = await storyPosts(surface.username)
      const picked = surface.storyId
        ? posts.filter((post) => post.id === surface.storyId || post.shortcode === surface.storyId)
        : posts
      const list = picked.length > 0 ? picked : posts
      if (list.length === 0) return { ok: false, error: 'No story media was available.' }
      await downloadPosts(surface, list)
      return { ok: true }
    }
    return { ok: false, error: 'Open a post or story to download it from here.' }
  } catch (error) {
    const message = humanError(error)
    notify(message)
    return { ok: false, error: message }
  }
}

export async function downloadShortcode(code: string): Promise<void> {
  try {
    const post = await mediaByShortcode(code)
    if (!post) {
      notify('Could not read that post.')
      return
    }
    await downloadPosts({ kind: 'post', shortcode: code }, [post])
  } catch (error) {
    notify(humanError(error))
  }
}

export function onMessage(
  message: { type?: string; range?: unknown; sortKey?: unknown; username?: unknown; query?: unknown; done?: number; total?: number },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  if (message?.type === 'AGENT_STATUS') {
    const snap = getSnap()
    if (snap.phase.type === 'ready') {
      sendResponse({
        ok: true,
        phase: 'ready',
        posts: snap.phase.model.posts,
        warning: snap.phase.model.warning,
        sortKey: snap.phase.model.sortKey,
      })
    } else if (snap.phase.type === 'error') {
      sendResponse({ ok: false, phase: 'error', error: snap.phase.message })
    } else if (snap.phase.type === 'collecting') {
      sendResponse({ ok: true, phase: 'collecting', collected: snap.phase.collected, label: snap.phase.label })
    } else {
      sendResponse({ ok: true, phase: 'idle' })
    }
    return false
  }
  if (message?.type === 'AGENT_SIMILAR') {
    const username = typeof message.username === 'string' ? message.username.trim().replace(/^@+/, '') : ''
    if (!username) {
      sendResponse({ ok: false, error: 'Name the profile to look up.' })
      return false
    }
    void similarAccounts(username)
      .then((accounts) => sendResponse({ ok: true, accounts }))
      .catch((error: unknown) => sendResponse({ ok: false, error: humanError(error) }))
    return true
  }
  if (message?.type === 'SORT') {
    if (!isRange(message.range) || !isSortKey(message.sortKey)) {
      sendResponse({ ok: false, error: 'The sort request was incomplete.' })
      return false
    }
    sendResponse(requestSort(message.range, message.sortKey))
    return false
  }
  if (message?.type === 'EXPORT_REELS') {
    const includeAds = Boolean((message as { includeAds?: unknown }).includeAds)
    const action = (message as { action?: unknown }).action
    const mode = action === 'copy' || action === 'json' || action === 'xlsx' || action === 'csv' ? action : 'csv'
    void exportCapturedReels(exportPostsInOrder, exportUsername, includeAds, mode).then(sendResponse)
    return true
  }
  if (message?.type === 'DOWNLOAD_CURRENT') {
    void downloadCurrent().then(sendResponse)
    return true
  }
  if (message?.type === 'DOWNLOAD_PROGRESS' && typeof message.done === 'number' && typeof message.total === 'number') {
    setDownloadProgress(message.done, message.total)
  }
  return false
}
