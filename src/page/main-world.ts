import { extractFollowerCounts, extractItems, extractSearchUsers, extractUserId, extractUsers } from '../lib/instagram/extract'
import { requestMatchesKeyword } from '../lib/page-accounts'
import { hashtagUrl } from '../lib/instagram/search'
import { isInstagramDataUrl, mergePost, parseBodies } from '../lib/instagram/capture'
import { normalizeMedia } from '../lib/instagram/normalize'
import { findUserIdInText, hasFeedbackRequired, HttpError, httpFailureMessage, responseSnippet } from '../lib/instagram/page-data'
import type { Post, SimilarAccount } from '../lib/types'
import { ISO_SOURCE, MAIN_SOURCE, type MainCall } from '../lib/protocol'

const APP_ID = '936619743392459'
const DEFAULT_ASBD = '359341'
const hooked = '__ifsHistoryHooked'

function cookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function pageValue(pattern: RegExp): string {
  for (const script of document.querySelectorAll('script:not([src])')) {
    const match = script.textContent?.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ''
}

function headers(): Record<string, string> {
  const csrf = cookie('csrftoken')
  const claim = cookie('ig_www_claim')
  const asbd = pageValue(/ASBD_ID["']?\s*[:=]\s*["']?(\d{4,10})/) || DEFAULT_ASBD
  const ajax = pageValue(/rollout_hash["']?\s*[:=]\s*["']([A-Za-z0-9_-]{6,})/)
  return {
    accept: '*/*',
    'x-ig-app-id': APP_ID,
    'x-asbd-id': asbd,
    'x-csrftoken': csrf,
    'x-csrf-token': csrf,
    'x-requested-with': 'XMLHttpRequest',
    ...(ajax ? { 'x-instagram-ajax': ajax } : {}),
    ...(claim ? { 'x-ig-www-claim': claim } : {}),
  }
}

const RETRY_DELAYS = [2000, 5000, 10000]

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (!header) return null
  const seconds = Number(header)
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 30000) : null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function reportTrace(url: string, status: number, snippet: string): void {
  const nonce = document.documentElement.getAttribute('data-ifs-nonce')
  window.postMessage(
    { source: MAIN_SOURCE, type: 'TRACE', nonce, url, status, snippet: snippet.slice(0, 180) },
    window.location.origin,
  )
}

async function igFetch(url: string, init: RequestInit = {}, retries = RETRY_DELAYS.length): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      credentials: 'include',
      ...init,
      headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
    })
    const text = await response.text()
    const snippet = responseSnippet(text) || (response.ok ? 'ok' : '')
    reportTrace(url, response.status, snippet)
    const feedback = hasFeedbackRequired(text)
    if (response.status === 429 && !feedback && attempt < retries) {
      await wait(retryAfterMs(response) ?? RETRY_DELAYS[attempt])
      continue
    }
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(
        `${httpFailureMessage(response.status, text)} Refresh the page and make sure you are signed in.`,
        response.status,
        url,
        snippet,
      )
    }
    if (!response.ok || feedback) throw new HttpError(httpFailureMessage(response.status, text), response.status, url, snippet)
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new HttpError(
        'Instagram returned a page instead of post data. Refresh and try again.',
        response.status,
        url,
        snippet || 'Instagram returned HTML instead of JSON.',
      )
    }
  }
}

function userIdFromPage(username: string): string | undefined {
  const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])')
  for (const script of scripts) {
    const text = script.textContent || ''
    if (!text.toLowerCase().includes(`"${username.toLowerCase()}"`)) continue
    const id = findUserIdInText(text, username)
    if (id) return id
  }
  return undefined
}

function cachedUserId(username: string): string | undefined {
  return userIds.get(username.toLowerCase()) || userIdFromPage(username)
}

let nextProfileAt = 0

async function waitForPageId(username: string): Promise<string | undefined> {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const id = cachedUserId(username)
    if (id) return id
    await wait(250)
  }
  return cachedUserId(username)
}

async function webProfile(username: string): Promise<unknown> {
  const gap = nextProfileAt - Date.now()
  if (gap > 0) await wait(gap)
  nextProfileAt = Date.now() + 1200
  try {
    return await igFetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`)
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) nextProfileAt = Date.now() + 15_000
    throw error
  }
}

async function profile(username: string): Promise<unknown> {
  scanEmbedded()
  const known = cachedUserId(username) || (viewingProfile(username) ? await waitForPageId(username) : undefined)
  if (known) {
    userIds.set(username.toLowerCase(), known)
    return { data: { user: { id: known } } }
  }
  const raw = await webProfile(username)
  ingest(raw)
  return raw
}

function exceptTarget(username: string, accounts: SimilarAccount[]): SimilarAccount[] {
  const key = username.toLowerCase()
  return accounts.filter((account) => account.username.toLowerCase() !== key).slice(0, 80)
}

function relatedInDocument(): SimilarAccount[] {
  const found: SimilarAccount[] = []
  const seen = new Set<string>()
  for (const script of document.querySelectorAll('script[type="application/json"], script:not([src])')) {
    const text = script.textContent || ''
    if (!/related_profiles|edge_chaining|discover__chaining|suggested_users/i.test(text)) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(text.trim().replace(/^for \(;;\);/, ''))
    } catch {
      continue
    }
    for (const account of extractUsers(parsed, false)) {
      const name = account.username.toLowerCase()
      if (seen.has(name)) continue
      seen.add(name)
      found.push(account)
    }
  }
  return found
}

function fetchOnce(url: string): Promise<unknown> {
  return withTimeout(igFetch(url, {}, 0), 8000)
}

function viewingProfile(username: string): boolean {
  const first = location.pathname.split('/').filter(Boolean)[0]?.toLowerCase()
  return first === username.toLowerCase()
}

async function similarTo(username: string): Promise<SimilarAccount[]> {
  if (viewingProfile(username)) {
    const embedded = exceptTarget(username, relatedInDocument())
    if (embedded.length > 0) return embedded
  }

  let id = cachedUserId(username) || (viewingProfile(username) ? await waitForPageId(username) : undefined)
  let lastError: unknown
  let profilePayload: unknown = null
  if (!id) {
    profilePayload = await webProfile(username).catch((error: unknown) => {
      lastError = error
      return null
    })
  }
  if (profilePayload) {
    ingest(profilePayload)
    const found = exceptTarget(username, extractUsers(profilePayload))
    if (found.length > 0) return found
    id = id || extractUserId(profilePayload)
  }
  if (!id) {
    if (lastError) throw lastError
    return []
  }

  const urls = [
    `https://www.instagram.com/api/v1/discover/chaining/?target_id=${encodeURIComponent(id)}&module=profile`,
    `https://www.instagram.com/api/v1/discover/chaining/?target_id=${encodeURIComponent(id)}`,
  ]
  let sawResponse = false
  for (const url of urls) {
    const raw = await fetchOnce(url).catch((error: unknown) => {
      lastError = error
      return null
    })
    if (!raw) continue
    sawResponse = true
    const found = exceptTarget(username, extractUsers(raw))
    if (found.length > 0) return found
  }
  if (!sawResponse && lastError) throw lastError
  return []
}

function withMax(url: string, maxId?: string): string {
  if (!maxId) return url
  const next = new URL(url)
  next.searchParams.set('max_id', maxId)
  return next.toString()
}

function capturedUserPayload(): unknown {
  scanEmbedded()
  return {
    users: Array.from(capturedAccounts.values()).map((account) => ({
      user: {
        pk: account.id,
        username: account.username,
        full_name: account.fullName,
        is_verified: account.verified,
        is_private: account.isPrivate,
        follower_count: account.followers,
        profile_pic_url: account.avatarUrl,
      },
    })),
  }
}

async function reelsSearch(query: string): Promise<unknown> {
  void query
  return capturedUserPayload()
}

async function hashtagPage(query: string): Promise<unknown> {
  const url = hashtagUrl(query)
  if (!url) return { items: [] }
  return igFetch(url)
}

async function search(query: string, maxId?: string): Promise<unknown> {
  void query
  void maxId
  scanEmbedded()
  return { items: Array.from(captured.values()) }
}

async function collection(id: string, maxId?: string): Promise<unknown> {
  const suffix = maxId ? `?max_id=${encodeURIComponent(maxId)}` : ''
  try {
    return await igFetch(`https://www.instagram.com/api/v1/feed/collection/${id}/${suffix}`)
  } catch {
    return igFetch(`https://www.instagram.com/api/v1/feed/collection/${id}/posts/${suffix}`)
  }
}

function responseHasVideo(raw: unknown): boolean {
  return extractItems(raw, 12).some((item) => {
    const post = normalizeMedia(item)
    return Boolean(post?.videoUrl || post?.slides.some((slide) => slide.kind === 'video'))
  })
}

async function mediaDetails(id: string): Promise<unknown> {
  const info = await igFetch(`https://www.instagram.com/api/v1/media/${encodeURIComponent(id)}/info/`)
  if (responseHasVideo(info)) return info
  try {
    const clip = await igFetch(
      `https://www.instagram.com/api/v1/clips/item/?clips_media_id=${encodeURIComponent(id)}`,
    )
    if (responseHasVideo(clip)) return clip
  } catch {
    // The media info response is still the best available.
  }
  return info
}

async function run(call: MainCall): Promise<unknown> {
  switch (call.action) {
    case 'profile':
      return profile(call.username || '')
    case 'feed':
      return igFetch(withMax(`https://www.instagram.com/api/v1/feed/user/${call.userId}/?count=12`, call.maxId))
    case 'clips': {
      const body = new URLSearchParams()
      body.set('include_feed_video', 'true')
      body.set('page_size', '12')
      body.set('target_user_id', call.userId || '')
      if (call.maxId) body.set('max_id', call.maxId)
      return igFetch('https://www.instagram.com/api/v1/clips/user/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      })
    }
    case 'saved':
      return igFetch(withMax('https://www.instagram.com/api/v1/feed/saved/posts/', call.maxId))
    case 'collection':
      return collection(call.collectionId || '', call.maxId)
    case 'search':
      return search(call.query || '', call.maxId)
    case 'media':
      return mediaDetails(call.mediaId || '')
    case 'stories':
      return igFetch(
        `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(call.userId || '')}`,
      )
    case 'similar':
      return similarTo(call.username || '')
    case 'user-search':
      return capturedUserPayload()
    case 'reels-search':
      return reelsSearch(call.query || '')
    case 'hashtag':
      return hashtagPage(call.query || '')
    case 'captured':
      scanEmbedded()
      return Array.from(captured.values())
    case 'captured-accounts':
      scanEmbedded()
      return Array.from(capturedAccounts.values())
    case 'search-hits':
      return Array.from(searchHits.values())
    case 'followers':
      return followers(call.username || '')
    case 'following':
      return followingPage(call.username || '', call.maxId)
    default:
      throw new Error('Unknown request.')
  }
}

function hookHistory(): void {
  const historyBag = history as History & { [hooked]?: boolean }
  if (historyBag[hooked]) return
  historyBag[hooked] = true
  const notify = () => window.postMessage({ source: MAIN_SOURCE, type: 'NAV' }, window.location.origin)
  const push = history.pushState.bind(history)
  const replace = history.replaceState.bind(history)
  history.pushState = (...args) => {
    const result = push(...args)
    notify()
    return result
  }
  history.replaceState = (...args) => {
    const result = replace(...args)
    notify()
    return result
  }
  window.addEventListener('popstate', notify)
}

const captured = new Map<string, Post>()
const capturedAccounts = new Map<string, SimilarAccount>()
const searchHits = new Map<string, SimilarAccount>()
const followerCounts = new Map<string, number>()
const userIds = new Map<string, string>()
const scannedScripts = new WeakSet<Element>()

function rememberIds(raw: unknown): void {
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 12) return
    if (Array.isArray(node)) {
      if (depth > 6 && node.length > 40) return
      for (const item of node) walk(item, depth + 1)
      return
    }
    const record = node as Record<string, unknown>
    if (typeof record.username === 'string' && record.username) {
      const id = record.pk_id ?? record.pk ?? record.id
      if ((typeof id === 'string' || typeof id === 'number') && /^\d{3,20}$/.test(String(id))) {
        userIds.set(record.username.toLowerCase(), String(id))
      }
    }
    for (const value of Object.values(record)) walk(value, depth + 1)
  }
  walk(raw, 0)
}

function ingest(raw: unknown): void {
  for (const item of extractItems(raw, 80)) {
    const post = normalizeMedia(item)
    if (post) captured.set(post.id, mergePost(captured.get(post.id), post))
  }
  for (const account of extractUsers(raw)) {
    const key = account.username.toLowerCase()
    const existing = capturedAccounts.get(key)
    if (!existing || (existing.followers == null && account.followers != null)) capturedAccounts.set(key, account)
  }
  for (const [username, count] of extractFollowerCounts(raw)) followerCounts.set(username, count)
  rememberIds(raw)
}

async function followingPage(username: string, maxId?: string): Promise<unknown> {
  const info = await profile(username)
  const id = extractUserId(info)
  if (!id) throw new HttpError('Instagram did not return that profile.', 404)
  const url = new URL(`https://www.instagram.com/api/v1/friendships/${encodeURIComponent(id)}/following/`)
  url.searchParams.set('count', '12')
  if (maxId) url.searchParams.set('max_id', maxId)
  return igFetch(url.toString())
}

async function followers(username: string): Promise<number | null> {
  const key = username.toLowerCase()
  if (!key) return null
  scanEmbedded()
  const known = followerCounts.get(key)
  if (known != null) return known
  try {
    ingest(await webProfile(username))
  } catch {
    return null
  }
  return followerCounts.get(key) ?? null
}

function bodyText(body: unknown): string {
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const parts: string[] = []
    body.forEach((value, key) => {
      if (typeof value === 'string') parts.push(`${key}=${value}`)
    })
    return parts.join('&')
  }
  return ''
}

function rememberSearch(raw: unknown, url: string, body: string): void {
  if (!requestMatchesKeyword(location.href, url, body)) return
  for (const account of extractSearchUsers(raw)) {
    const key = account.username.toLowerCase()
    const existing = searchHits.get(key)
    if (!existing || (existing.followers == null && account.followers != null)) searchHits.set(key, account)
  }
}

function ingestText(text: string, meta?: { url: string; body: string }): void {
  for (const parsed of parseBodies(text)) {
    ingest(parsed)
    if (meta) rememberSearch(parsed, meta.url, meta.body)
  }
}

function scanEmbedded(): void {
  for (const script of document.querySelectorAll('script[type="application/json"]')) {
    if (scannedScripts.has(script)) continue
    scannedScripts.add(script)
    const text = script.textContent || ''
    if (text.includes('"code"') || text.includes('follower_count')) ingestText(text)
  }
}

function requestUrl(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (input instanceof Request) return input.url
  return ''
}

function hookNetwork(): void {
  const originalFetch = window.fetch
  window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
    const response = await originalFetch.apply(this, args)
    try {
      const url = requestUrl(args[0])
      if (isInstagramDataUrl(url, location.href)) {
        const body = bodyText(args[1]?.body)
        response
          .clone()
          .text()
          .then((text) => ingestText(text, { url, body }))
          .catch(() => undefined)
      }
    } catch {
      // Never break Instagram's own requests.
    }
    return response
  } as typeof fetch

  type TaggedRequest = XMLHttpRequest & { __ifsUrl?: string }
  const proto = XMLHttpRequest.prototype
  const open = proto.open as (...args: unknown[]) => void
  const send = proto.send
  ;(proto as unknown as { open: (...args: unknown[]) => void }).open = function (this: TaggedRequest, ...args: unknown[]) {
    this.__ifsUrl = String(args[1] ?? '')
    return open.apply(this, args)
  }
  proto.send = function (this: TaggedRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const url = this.__ifsUrl || ''
    const sent = bodyText(body)
    if (url && isInstagramDataUrl(url, location.href)) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') ingestText(this.responseText, { url, body: sent })
          else if (this.responseType === 'json') {
            ingest(this.response)
            rememberSearch(this.response, url, sent)
          }
        } catch {
          // Ignore responses we cannot read.
        }
      })
    }
    return send.call(this, body)
  }
}

function nonceMatches(nonce: unknown): boolean {
  return typeof nonce === 'string' && nonce.length > 0 && nonce === document.documentElement.getAttribute('data-ifs-nonce')
}

const pageWindow = window as Window & { __ifsMainInstalled?: boolean }
if (!pageWindow.__ifsMainInstalled) {
  pageWindow.__ifsMainInstalled = true
  hookNetwork()
  window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data as { source?: string; nonce?: string; id?: string } & MainCall
  if (!data || data.source !== ISO_SOURCE || !nonceMatches(data.nonce) || !data.id) return
  run(data)
    .then((payload) => {
      try {
        ingest(payload)
      } catch {
        // A non-post payload still goes back to the content script.
      }
      window.postMessage({ source: MAIN_SOURCE, nonce: data.nonce, id: data.id, payload }, window.location.origin)
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Instagram did not answer.'
      const status = error instanceof HttpError ? error.status : 0
      const url = error instanceof HttpError ? error.url : ''
      const snippet = error instanceof HttpError ? error.snippet : ''
      window.postMessage(
        { source: MAIN_SOURCE, nonce: data.nonce, id: data.id, error: message, status, url, snippet },
        window.location.origin,
      )
    })
  })
  hookHistory()
}
