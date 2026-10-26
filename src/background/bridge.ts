import { agentRows, BRIDGE_HOST, BRIDGE_PORT, jobBudgetMs, prepareSort, recordsFromPosts, type AgentFormat, type AgentRow, type PreparedSort } from '../lib/agent'
import { objectsToTable, tableToCsv, tableToJson } from '../lib/export'
import { DOWNLOAD_ROOT, safeSegment } from '../lib/media-files'
import { sortPosts } from '../lib/sort'
import type { Post, RangeChoice, SortKey } from '../lib/types'
import { buildXlsx } from '../lib/xlsx'

const JOB_KEY = 'ifs-agent-job'
const NEXT_URL = `http://${BRIDGE_HOST}:${BRIDGE_PORT}/bridge/next`
const RESULT_URL = `http://${BRIDGE_HOST}:${BRIDGE_PORT}/bridge/result`

export interface BridgeDeps {
  keepAwake: () => Promise<void>
  createSheet: (title: string, csv: string) => Promise<{ ok: boolean; url?: string; error?: string }>
  saveText: (filename: string, mime: string, text: string) => Promise<{ ok?: boolean; error?: string }>
  saveBytes: (filename: string, mime: string, base64: string) => Promise<{ ok?: boolean; error?: string }>
}

interface ProfileOutcome {
  label: string
  url: string
  collected?: number
  warning?: string | null
  top?: AgentRow[]
  records?: Record<string, string | number | null>[]
  error?: string
}

interface JobState {
  id: string
  targets: PreparedSort['targets']
  index: number
  started: boolean
  range: RangeChoice
  sortKey: SortKey
  show: number
  format: AgentFormat
  deadline: number
  tabId?: number
  profiles: ProfileOutcome[]
}

interface IncomingJob {
  id?: string
  type?: string
  payload?: unknown
}

let deps: BridgeDeps | null = null
let loopPromise: Promise<void> | null = null
let connected = false

export function bridgeSnapshot(): { connected: boolean } {
  return { connected }
}

export function startBridge(next: BridgeDeps): void {
  deps = next
  if (loopPromise) return
  loopPromise = runLoop().finally(() => {
    loopPromise = null
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runLoop(): Promise<void> {
  const saved = await chrome.storage.session.get(JOB_KEY)
  const existing = saved[JOB_KEY] as JobState | undefined
  if (existing?.id) {
    try {
      const result = await finishSort(existing)
      await postResult(existing.id, result)
    } catch (error) {
      await postResult(existing.id, { ok: false, error: messageOf(error) })
    }
  }
  for (;;) {
    let job: IncomingJob | null = null
    try {
      job = await pollJob()
    } catch {
      connected = false
      await sleep(2000)
      continue
    }
    if (!job?.id || job.type === 'noop') continue
    try {
      const result = job.type === 'related' ? await runRelated(job)
        : job.type === 'sort' ? await runSort(job)
        : { ok: false, error: 'Unknown Feed Sorter tool.' }
      await postResult(job.id, result)
    } catch (error) {
      await chrome.storage.session.remove(JOB_KEY)
      await postResult(job.id, { ok: false, error: messageOf(error) })
    }
  }
}

async function pollJob(): Promise<IncomingJob> {
  await deps?.keepAwake()
  const response = await fetch(NEXT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'instagram-feed-sorter' }),
  })
  connected = response.ok
  if (!response.ok) throw new Error(`Bridge answered ${response.status}`)
  return (await response.json()) as IncomingJob
}

async function postResult(id: string, body: { ok: boolean; result?: unknown; error?: string }): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(RESULT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      if (response.ok) {
        await chrome.storage.session.remove(JOB_KEY)
        return
      }
    } catch {
      // The bridge process may still be starting.
    }
    await sleep(1000)
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The browser could not finish that request.'
}

async function runSort(job: IncomingJob): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const prepared = prepareSort(job.payload)
  if ('error' in prepared) return { ok: false, error: prepared.error }
  const state: JobState = {
    id: job.id || '',
    targets: prepared.targets,
    index: 0,
    started: false,
    range: prepared.range,
    sortKey: prepared.sortKey,
    show: prepared.show,
    format: prepared.format,
    deadline: Date.now() + jobBudgetMs(prepared),
    profiles: [],
  }
  await saveJob(state)
  return finishSort(state)
}

async function finishSort(state: JobState): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  await deps?.keepAwake()
  while (state.index < state.targets.length) {
    if (Date.now() > state.deadline) {
      state.profiles.push({
        label: state.targets[state.index].label,
        url: state.targets[state.index].url,
        error: 'Stopped because this request ran too long. Ask for fewer posts.',
      })
      break
    }
    const outcome = await sortOne(state)
    state.profiles.push(outcome)
    state.index += 1
    state.started = false
    state.tabId = undefined
    await saveJob(state)
    if (state.index < state.targets.length) await sleep(2000)
  }
  const result = await packageSort(state)
  return { ok: true, result }
}

async function sortOne(state: JobState): Promise<ProfileOutcome> {
  const target = state.targets[state.index]
  try {
    const tabId = await openInstagram(target.url, state.tabId, state.started)
    if (tabId !== state.tabId) state.started = false
    state.tabId = tabId
    await saveJob(state)
    await waitForLoad(tabId, target.url)
    await bringForward(tabId)
    const tab = await chrome.tabs.get(tabId)
    if (tab.url && /\/accounts\/login|\/challenge\//.test(tab.url)) {
      return { label: target.label, url: target.url, error: 'Sign in to Instagram in this Chrome window, then ask again.' }
    }
    if (!state.started) {
      const started = await sendTab<{ ok?: boolean; error?: string }>(tabId, {
        type: 'SORT',
        range: state.range,
        sortKey: state.sortKey,
      })
      if (!started?.ok) return { label: target.label, url: target.url, error: started?.error || 'Could not start that sort.' }
      state.started = true
      await saveJob(state)
      await waitForReload(tabId)
    }
    return await waitForRows(tabId, state, target)
  } catch (error) {
    return { label: target.label, url: target.url, error: messageOf(error) }
  }
}

async function waitForRows(
  tabId: number,
  state: JobState,
  target: PreparedSort['targets'][number],
): Promise<ProfileOutcome> {
  let sawWork = false
  let quiet = 0
  while (Date.now() < state.deadline) {
    await deps?.keepAwake()
    let status: { phase?: string; error?: string; posts?: Post[]; warning?: string | null } | null = null
    try {
      status = await chrome.tabs.sendMessage(tabId, { type: 'AGENT_STATUS' })
    } catch {
      status = null
    }
    if (status?.phase === 'collecting') {
      sawWork = true
      quiet = 0
    } else if (status?.phase === 'idle' || status == null) {
      quiet += 1
    }
    if (!sawWork && quiet >= 20) {
      return { label: target.label, url: target.url, error: 'The sort did not start. Reload the extension at chrome://extensions, then refresh Instagram.' }
    }
    if (status?.phase === 'error') return { label: target.label, url: target.url, error: status.error || 'The sort failed.' }
    if (status?.phase === 'ready' && Array.isArray(status.posts)) {
      const ranked = sortPosts(status.posts, state.sortKey)
      return {
        label: target.label,
        url: target.url,
        collected: ranked.length,
        warning: status.warning ?? null,
        top: agentRows(ranked, state.show),
        records: recordsFromPosts(ranked),
      }
    }
    if (status?.phase === 'idle' && sawWork) {
      return { label: target.label, url: target.url, error: 'The sort closed before it finished.' }
    }
    await sleep(1000)
  }
  return { label: target.label, url: target.url, error: 'The sort timed out. Try a smaller number of posts.' }
}

async function packageSort(state: JobState): Promise<Record<string, unknown>> {
  const ready = state.profiles.filter((profile) => profile.records && profile.records.length > 0)
  const records = ready.flatMap((profile) => profile.records ?? [])
  const exported = await exportRecords(state, records)
  return {
    note: 'Chrome was brought to the front. The sort only read posts. It did not like, follow, or comment.',
    sortedBy: state.sortKey,
    requested: state.range.count,
    since: state.range.date,
    profiles: state.profiles.map((profile) => ({
      label: profile.label,
      url: profile.url,
      collected: profile.collected ?? 0,
      warning: profile.warning ?? null,
      error: profile.error,
      top: profile.top ?? [],
    })),
    export: exported,
  }
}

async function exportRecords(state: JobState, records: Record<string, string | number | null>[]): Promise<Record<string, unknown> | null> {
  if (state.format === 'none' || records.length === 0 || !deps) return null
  const table = objectsToTable(records)
  const base = safeSegment(state.targets.map((target) => target.label).join('-'))
  const folder = DOWNLOAD_ROOT
  if (state.format === 'sheets') {
    const csv = tableToCsv(table)
    const sheet = await deps.createSheet(base.slice(0, 80), csv)
    return sheet.ok
      ? { format: 'sheets', sheetUrl: sheet.url }
      : { format: 'sheets', error: sheet.error || 'Could not create the Google Sheet.', csv: clip(csv) }
  }
  if (state.format === 'excel') {
    const bytes = await buildXlsx(base, table)
    const filename = `${folder}/${base}.xlsx`
    const saved = await deps.saveBytes(
      filename,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64Of(bytes),
    )
    return saved?.ok === false
      ? { format: 'excel', error: saved.error || 'Could not save the Excel file.' }
      : { format: 'excel', file: filename }
  }
  const isJson = state.format === 'json'
  const body = isJson ? tableToJson(table) : tableToCsv(table)
  const filename = `${folder}/${base}.${isJson ? 'json' : 'csv'}`
  const saved = await deps.saveText(filename, isJson ? 'application/json' : 'text/csv;charset=utf-8', body)
  const payload: Record<string, unknown> = {
    format: state.format,
    file: saved?.ok === false ? undefined : filename,
    error: saved?.ok === false ? saved.error || 'Could not save the file.' : undefined,
  }
  const clipped = clip(body)
  payload[isJson ? 'json' : 'csv'] = clipped.text
  if (clipped.trimmed) payload.note = 'The reply has the start of the file. The full file was saved in Downloads.'
  return payload
}

function clip(text: string): { text: string; trimmed: boolean } {
  if (text.length <= 100_000) return { text, trimmed: false }
  return { text: `${text.slice(0, 4000)}\n…`, trimmed: true }
}

export async function lookupSimilar(
  username: string,
): Promise<{ ok: true; username: string; note: string; accounts: unknown[] } | { ok: false; error: string }> {
  const name = username.trim().replace(/^@+/, '')
  if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) return { ok: false, error: 'Name an Instagram username.' }
  const url = `https://www.instagram.com/${encodeURIComponent(name)}/`
  const tabId = await openInstagram(url)
  await waitForLoad(tabId, url)
  await bringForward(tabId)
  const tab = await chrome.tabs.get(tabId)
  if (tab.url && /\/accounts\/login|\/challenge\//.test(tab.url)) {
    return { ok: false, error: 'Sign in to Instagram in this Chrome window, then ask again.' }
  }
  const response = await sendTab<{ ok?: boolean; error?: string; accounts?: unknown[] }>(tabId, {
    type: 'AGENT_SIMILAR',
    username: name,
  })
  if (!response?.ok) return { ok: false, error: response?.error || 'Could not look up related profiles.' }
  return {
    ok: true,
    username: name,
    note: 'These are profiles Instagram lists near that account. Nothing was followed.',
    accounts: Array.isArray(response.accounts) ? response.accounts : [],
  }
}

async function runRelated(job: IncomingJob): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const username = typeof (job.payload as { username?: unknown } | undefined)?.username === 'string' ? (job.payload as { username: string }).username : ''
  const found = await lookupSimilar(username)
  if (!found.ok) return found
  return { ok: true, result: { username: found.username, note: found.note, accounts: found.accounts } }
}

let agentTabId: number | undefined

async function openInstagram(url: string, preferred?: number, keepPage = false): Promise<number> {
  const existing = preferred ?? agentTabId
  if (existing != null) {
    try {
      const current = await chrome.tabs.get(existing)
      if (keepPage && current.url && sameInstagram(current.url, url)) {
        agentTabId = existing
        return existing
      }
      await chrome.tabs.update(existing, { url, active: true })
      agentTabId = existing
      return existing
    } catch {
      agentTabId = undefined
    }
  }
  const tab = await chrome.tabs.create({ url, active: true })
  if (tab.id == null) throw new Error('Could not open Instagram.')
  agentTabId = tab.id
  return tab.id
}

async function bringForward(tabId: number): Promise<void> {
  const tab = await chrome.tabs.update(tabId, { active: true })
  if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined)
}

function sameInstagram(actual: string, expected: string): boolean {
  try {
    const got = new URL(actual)
    const want = new URL(expected)
    if (!got.hostname.endsWith('instagram.com')) return false
    const path = (value: string) => value.replace(/\/$/, '')
    if (path(got.pathname) !== path(want.pathname)) return false
    const query = want.searchParams.get('q')
    return query == null || got.searchParams.get('q') === query
  } catch {
    return false
  }
}

async function waitForLoad(tabId: number, expected: string): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < 45_000) {
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === 'complete' && tab.url && sameInstagram(tab.url, expected)) {
      await sleep(500)
      return
    }
    await sleep(250)
  }
  throw new Error('Instagram took too long to open.')
}

async function waitForReload(tabId: number): Promise<void> {
  const start = Date.now()
  let sawLoading = false
  while (Date.now() - start < 20_000) {
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === 'loading') sawLoading = true
    if (sawLoading && tab.status === 'complete') {
      await sleep(600)
      return
    }
    await sleep(200)
  }
  if (!sawLoading) throw new Error('The profile did not reload. Reload the extension at chrome://extensions and try again.')
}

async function sendTab<T>(tabId: number, message: unknown): Promise<T> {
  let last = 'The Instagram tab has not loaded the extension yet.'
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      return (await chrome.tabs.sendMessage(tabId, message)) as T
    } catch (error) {
      last = messageOf(error)
      await sleep(400)
    }
  }
  throw new Error(last)
}

async function saveJob(state: JobState): Promise<void> {
  try {
    await chrome.storage.session.set({ [JOB_KEY]: state })
  } catch {
    const slim: JobState = {
      ...state,
      profiles: state.profiles.map((profile) => ({ ...profile, records: undefined })),
    }
    await chrome.storage.session.set({ [JOB_KEY]: slim }).catch(() => undefined)
  }
}

function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}
