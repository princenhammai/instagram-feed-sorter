import { bridgeSnapshot, startBridge } from './bridge'
import { createFolder, INBOX_ID, listFolders, putSaved, type SavedPost } from '../lib/db'
import { isAllowedMediaUrl, isInstagramUrl } from '../lib/media-files'
import { sapisidToken, sheetUploadBody } from '../lib/sheets'
import { loadSettings } from '../lib/settings'
import { offscreenDocumentExists } from '../lib/offscreen'
import { DEFAULT_TRANSCRIBE_ENDPOINT, type Post } from '../lib/types'

const SHEETS_URL = 'https://docs.google.com/spreadsheets/create'
const SHEETS_HOME = 'https://docs.google.com/spreadsheets/u/0/'
const SHEETS_ORIGIN = 'https://docs.google.com'

const MAX_BYTES = 400 * 1024 * 1024

let activeTabId: number | undefined
let zipBusy = false
let opening: Promise<void> | null = null

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL('offscreen.html')
  const scope = globalThis as typeof globalThis & { clients?: { matchAll(): Promise<{ url: string }[]> } }
  if (await offscreenDocumentExists({
    url,
    hasDocument: typeof chrome.offscreen.hasDocument === 'function' ? () => chrome.offscreen.hasDocument() : undefined,
    contextUrls: typeof chrome.runtime.getContexts === 'function' ? async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType], documentUrls: [url] })).map((context) => context.documentUrl) : undefined,
    clientUrls: scope.clients ? async () => (await scope.clients!.matchAll()).map((client) => client.url) : undefined,
  })) return
  if (!opening) {
    opening = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['BLOBS'],
        justification: 'Build zip, CSV, and Excel downloads on this computer',
      })
      .then(() => undefined)
      .finally(() => {
        opening = null
      })
  }
  await opening
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PING' })
      if (response?.ok) return
    } catch {
      // The offscreen document is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function fetchBlob(url: string): Promise<Blob | null> {
  if (!isAllowedMediaUrl(url)) return null
  try {
    const response = await fetch(url, { credentials: 'omit' })
    if (!response.ok) return null
    const blob = await response.blob()
    return blob.size > MAX_BYTES ? null : blob
  } catch {
    return null
  }
}

function cleanFilename(filename: unknown): string | null {
  if (typeof filename !== 'string') return null
  const cleaned = filename.replace(/^\/+/, '')
  if (!cleaned || cleaned.includes('..') || cleaned.length > 180) return null
  return cleaned
}

function cleanEntries(entries: unknown): { name: string; url: string }[] {
  if (!Array.isArray(entries)) return []
  const files: { name: string; url: string }[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const name = (entry as { name?: unknown }).name
    const url = (entry as { url?: unknown }).url
    if (typeof name !== 'string' || typeof url !== 'string') continue
    if (!name || name.includes('..') || name.length > 180) continue
    if (!isAllowedMediaUrl(url)) continue
    files.push({ name, url })
    if (files.length >= 2000) break
  }
  return files
}

function asPost(value: unknown): Post | null {
  if (!value || typeof value !== 'object') return null
  const post = value as Post
  if (typeof post.id !== 'string' || typeof post.shortcode !== 'string' || typeof post.url !== 'string') return null
  return post
}

const WHISPER_LIMIT = 25 * 1024 * 1024
const TRANSCRIPT_PREFIX = 'ifs-transcript-'

async function transcribe(post: Post, force: boolean): Promise<{ ok: boolean; text?: string; error?: string }> {
  const cacheKey = `${TRANSCRIPT_PREFIX}${post.id}`
  if (!force) {
    const cached = await chrome.storage.local.get(cacheKey)
    if (typeof cached[cacheKey] === 'string') return { ok: true, text: cached[cacheKey] as string }
  }
  const settings = await loadSettings()
  if (!settings.transcribeKey.trim()) {
    return { ok: false, error: 'Add a transcription API key in the extension popup settings first.' }
  }
  const sources = [post.videoLowUrl, post.videoUrl, post.slides.find((slide) => slide.kind === 'video')?.url].filter(
    (url): url is string => typeof url === 'string' && isAllowedMediaUrl(url),
  )
  if (sources.length === 0) return { ok: false, error: 'This post has no video to transcribe.' }

  let media: Blob | null = null
  for (const url of sources) {
    try {
      const response = await fetch(url, { credentials: 'omit' })
      if (!response.ok) continue
      const blob = await response.blob()
      if (blob.size <= WHISPER_LIMIT) {
        media = blob
        break
      }
    } catch {
      // Try the next rendition.
    }
  }
  if (!media) return { ok: false, error: 'Could not fetch a video under 25 MB for transcription.' }

  const form = new FormData()
  form.append('file', new File([media], `${post.shortcode || post.id}.mp4`, { type: 'video/mp4' }))
  form.append('model', settings.transcribeModel.trim() || 'whisper-1')
  form.append('response_format', 'json')
  const response = await fetch(settings.transcribeEndpoint.trim() || DEFAULT_TRANSCRIBE_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${settings.transcribeKey.trim()}` },
    body: form,
  })
  const raw = await response.text()
  if (!response.ok) {
    let detail = raw.slice(0, 200)
    try {
      detail = (JSON.parse(raw) as { error?: { message?: string } }).error?.message || detail
    } catch {
      // Keep the raw snippet.
    }
    return { ok: false, error: `Transcription failed (${response.status}): ${detail}` }
  }
  let text = raw
  try {
    text = (JSON.parse(raw) as { text?: string }).text ?? raw
  } catch {
    // Plain-text responses are fine as is.
  }
  text = text.trim()
  await chrome.storage.local.set({ [cacheKey]: text })
  return { ok: true, text }
}

async function saveIncoming(post: Post, folderId = INBOX_ID): Promise<{ ok: boolean; warning?: string; error?: string }> {
  const cover = post.coverUrl ? await fetchBlob(post.coverUrl) : null
  const video = post.videoUrl ? await fetchBlob(post.videoUrl) : null
  const slides: SavedPost['slides'] = []
  if (post.mediaKind === 'carousel') {
    for (const slide of post.slides ?? []) {
      const blob = await fetchBlob(slide.url)
      if (blob) slides.push({ kind: slide.kind, blob })
    }
  }
  const warning =
    post.videoUrl && !video
      ? 'Saved the post, but the video file could not be stored. The cover and details are in your library.'
      : undefined
  await putSaved({
    id: post.id,
    folderId,
    savedAt: Date.now(),
    post,
    cover: cover ?? undefined,
    video: video ?? undefined,
    slides,
    mediaWarning: warning,
  })
  return { ok: true, warning }
}

async function googleCookie(name: string): Promise<string> {
  const found = await chrome.cookies.get({ url: `${SHEETS_ORIGIN}/`, name })
  return found?.value ?? ''
}

function waitForTab(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (url: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve(url)
    }
    const listener = (id: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (id === tabId && info.status === 'complete') finish(tab.url || '')
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error('Google Sheets took too long to open.'))
    }, 20000)
    chrome.tabs.onUpdated.addListener(listener)
    void chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish(tab.url || '')
    })
  })
}

async function uploadSheetInPage(
  body: string,
  boundary: string,
  authorization: string,
): Promise<{ url?: string; error?: string }> {
  const key = document.documentElement.innerHTML.match(/AIzaSy[\w-]{20,}/)?.[0] ?? ''
  const response = await fetch(
    `https://clients6.google.com/upload/drive/v2internal/files?uploadType=multipart&convert=true&supportsTeamDrives=true&fields=id,mimeType${key ? `&key=${key}` : ''}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: authorization,
        'X-Goog-AuthUser': '0',
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  const text = await response.text()
  if (!response.ok) return { error: `Google returned ${response.status}. ${text.slice(0, 160)}` }
  try {
    const payload = JSON.parse(text.replace(/^\)\]\}'\s*/, '')) as { id?: unknown }
    if (typeof payload.id !== 'string' || !payload.id) return { error: 'Google did not return a sheet.' }
    return { url: `https://docs.google.com/spreadsheets/d/${payload.id}/edit` }
  } catch {
    return { error: 'Google returned something that was not a sheet.' }
  }
}

async function createGoogleSheet(title: string, csv: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const sapisid = (await googleCookie('SAPISID')) || (await googleCookie('__Secure-1PAPISID'))
  if (!sapisid) {
    return { ok: false, error: 'This browser is not signed in to Google.' }
  }
  const now = Date.now()
  const authorization = [`SAPISIDHASH ${await sapisidToken(sapisid, SHEETS_ORIGIN, now)}`]
  const firstParty = await googleCookie('__Secure-1PAPISID')
  const thirdParty = await googleCookie('__Secure-3PAPISID')
  if (firstParty) authorization.push(`SAPISID1PHASH ${await sapisidToken(firstParty, SHEETS_ORIGIN, now)}`)
  if (thirdParty) authorization.push(`SAPISID3PHASH ${await sapisidToken(thirdParty, SHEETS_ORIGIN, now)}`)

  const boundary = `ifs${crypto.randomUUID().replace(/-/g, '')}`
  const body = sheetUploadBody(title, csv, boundary)
  const tab = await chrome.tabs.create({ url: SHEETS_HOME, active: false })
  if (tab.id == null) return { ok: false, error: 'Could not open Google Sheets.' }
  try {
    const url = await waitForTab(tab.id)
    if (!url.startsWith(SHEETS_ORIGIN)) {
      await chrome.tabs.remove(tab.id)
      return { ok: false, error: 'Sign in to Google in this browser, then export again.' }
    }
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: uploadSheetInPage,
      args: [body, boundary, authorization.join(' ')],
    })
    const result = injected?.result
    if (!result?.url) {
      await chrome.tabs.remove(tab.id)
      return { ok: false, error: result?.error || 'Google did not create the sheet.' }
    }
    await chrome.tabs.update(tab.id, { url: result.url, active: true })
    return { ok: true, url: result.url }
  } catch (error) {
    await chrome.tabs.remove(tab.id).catch(() => undefined)
    return { ok: false, error: error instanceof Error ? error.message : 'Could not create the Google Sheet.' }
  }
}

async function handle(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (message.type === 'ENSURE_MAIN') {
    const tabId = sender.tab?.id
    if (tabId == null) return { ok: false, error: 'Open Instagram in a normal tab.' }
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['main-world.js'],
        world: 'MAIN',
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not start on this tab.' }
    }
  }

  if (message.type === 'OPEN_TAB') {
    if (typeof message.url !== 'string' || !isInstagramUrl(message.url)) {
      return { ok: false, error: 'Only Instagram links can be opened.' }
    }
    await chrome.tabs.create({ url: message.url, active: Boolean(message.active) })
    return { ok: true }
  }

  if (message.type === 'OPEN_SHEETS') {
    await chrome.tabs.create({ url: SHEETS_URL, active: true })
    return { ok: true }
  }

  if (message.type === 'CREATE_SHEET') {
    if (typeof message.title !== 'string' || typeof message.csv !== 'string' || !message.csv.trim()) {
      return { ok: false, error: 'There were no rows to put in the sheet.' }
    }
    return createGoogleSheet(message.title.slice(0, 80), message.csv)
  }

  if (message.type === 'DOWNLOAD_URL') {
    const filename = cleanFilename(message.filename)
    if (!filename || typeof message.url !== 'string' || !isAllowedMediaUrl(message.url)) {
      return { ok: false, error: 'That file address was rejected.' }
    }
    await chrome.downloads.download({
      url: message.url,
      filename,
      conflictAction: 'uniquify',
      saveAs: Boolean(message.saveAs),
    })
    return { ok: true }
  }

  if (message.type === 'LIST_FOLDERS') {
    return { ok: true, folders: await listFolders() }
  }

  if (message.type === 'CREATE_FOLDER') {
    if (typeof message.name !== 'string' || !message.name.trim()) return { ok: false, error: 'Name the folder first.' }
    return { ok: true, folder: await createFolder(message.name.slice(0, 80)) }
  }

  if (message.type === 'TRANSCRIBE') {
    const post = asPost(message.post)
    if (!post) return { ok: false, error: 'That post was missing details.' }
    try {
      return await transcribe(post, Boolean(message.force))
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Transcription failed.' }
    }
  }

  if (message.type === 'DOWNLOAD_TEXT' || message.type === 'DOWNLOAD_BYTES') {
    const filename = cleanFilename(message.filename)
    if (!filename || typeof message.mime !== 'string') return { ok: false, error: 'Could not name that export.' }
    await ensureOffscreen()
    return chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'FILE',
      filename,
      mime: message.mime,
      text: message.text,
      base64: message.base64,
      saveAs: Boolean(message.saveAs),
    })
  }

  if (message.type === 'DOWNLOAD_ZIP') {
    if (zipBusy) return { ok: false, error: 'A download is already running.' }
    const filename = cleanFilename(message.filename)
    const entries = cleanEntries(message.entries)
    if (!filename || entries.length === 0) return { ok: false, error: 'Nothing safe to download.' }
    zipBusy = true
    activeTabId = sender.tab?.id
    try {
      await ensureOffscreen()
      return await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ZIP', filename, entries })
    } finally {
      zipBusy = false
    }
  }

  if (message.type === 'CANCEL_ZIP') {
    await ensureOffscreen()
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'CANCEL' })
    return { ok: true }
  }

  if (message.type === 'BRIDGE_STATUS') return bridgeSnapshot()

  if (message.type === 'SAVE_POST') {
    const post = asPost(message.post)
    if (!post) return { ok: false, error: 'That post was missing details.' }
    const folderId = typeof message.folderId === 'string' && message.folderId ? message.folderId : INBOX_ID
    try {
      return await saveIncoming(post, folderId)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not save that post.' }
    }
  }

  return { ok: false, error: 'Unknown request.' }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === 'background' && message.type === 'BRIDGE_PING') return false
  if (message?.target === 'background' && message.type === 'PROGRESS') {
    if (activeTabId != null) {
      void chrome.tabs.sendMessage(activeTabId, {
        type: 'DOWNLOAD_PROGRESS',
        done: message.done,
        total: message.total,
      }).catch(() => undefined)
    }
    return false
  }
  if (message?.target === 'offscreen') return false
  void handle(message ?? {}, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : 'The extension hit an error.' })
    })
  return true
})

const bridgeDeps = {
  keepAwake: ensureOffscreen,
  createSheet: createGoogleSheet,
  saveText: async (filename: string, mime: string, text: string) => {
    await ensureOffscreen()
    return chrome.runtime.sendMessage({ target: 'offscreen', type: 'FILE', filename, mime, text, saveAs: false })
  },
  saveBytes: async (filename: string, mime: string, base64: string) => {
    await ensureOffscreen()
    return chrome.runtime.sendMessage({ target: 'offscreen', type: 'FILE', filename, mime, base64, saveAs: false })
  },
}

function wakeBridge(): void {
  startBridge(bridgeDeps)
}

wakeBridge()
chrome.runtime.onInstalled.addListener(() => wakeBridge())
chrome.runtime.onStartup.addListener(() => wakeBridge())
chrome.alarms.create('ifs-bridge', { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ifs-bridge') wakeBridge()
})
