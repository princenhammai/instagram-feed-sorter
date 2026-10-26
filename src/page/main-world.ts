import { extractFollowerCounts, extractItems, extractUserId, extractUsers } from '../lib/instagram/extract'
import { accountSearchUrl } from '../lib/instagram/search'
import { isInstagramDataUrl, mergePost, parseBodies } from '../lib/instagram/capture'
import { normalizeMedia } from '../lib/instagram/normalize'
import { findUserIdInText, HttpError } from '../lib/instagram/page-data'
import type { Post, SimilarAccount } from '../lib/types'
import { ISO_SOURCE, MAIN_SOURCE, type MainCall } from '../lib/protocol'

const APP_ID = '936619743392459'
const hooked = '__ifsHistoryHooked'

function cookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function headers(): Record<string, string> {
  const csrf = cookie('csrftoken')
  const claim = cookie('ig_www_claim')
  return {
    accept: 'application/json',
    'x-ig-app-id': APP_ID,
    'x-csrftoken': csrf,
    'x-csrf-token': csrf,
    'x-requested-with': 'XMLHttpRequest',
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

async function igFetch(url: string, init: RequestInit = {}, retries = RETRY_DELAYS.length): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      credentials: 'include',
      ...init,
      headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
    })
    if (response.status === 429 && attempt < retries) {
      await wait(retryAfterMs(response) ?? RETRY_DELAYS[attempt])
      continue
    }
    if (response.status === 401 || response.status === 403) {
      throw new HttpError('Instagram refused the request. Refresh the page and make sure you are signed in.', response.status)
    }
    if (response.status === 429) {
      throw new HttpError('Instagram is rate limiting this account. Wait a few minutes, then sort a smaller batch.', 429)
    }
    const text = await response.text()
    if (!response.ok) throw new HttpError(`Instagram returned ${response.status} for this page.`, response.status)
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new HttpError('Instagram returned a page instead of post data. Refresh and try again.', response.status)
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

async function profile(username: string): Promise<unknown> {
  const fromPage = userIdFromPage(username)
  if (fromPage) return { data: { user: { id: fromPage } } }
  try {
    return await igFetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    )
  } catch (error) {
    const search = (await igFetch(accountSearchUrl(username)).catch(() => null)) as {
      users?: { user?: { username?: string; pk?: unknown; pk_id?: unknown } }[]
    } | null
    const hit = search?.users?.find((item) => item.user?.username?.toLowerCase() === username.toLowerCase())
    const id = hit?.user?.pk_id ?? hit?.user?.pk
    if (id != null) return { data: { user: { id: String(id) } } }
    throw error
  }
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

  let id = userIdFromPage(username)
  const profile = await fetchOnce(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
  ).catch(() => null)
  if (profile) {
    const found = exceptTarget(username, extractUsers(profile))
    if (found.length > 0) return found
    id = id || extractUserId(profile)
  }
  if (!id) return []

  const urls = [
    `https://www.instagram.com/api/v1/discover/chaining/?target_id=${encodeURIComponent(id)}&module=profile`,
    `https://www.instagram.com/api/v1/discover/chaining/?target_id=${encodeURIComponent(id)}`,
  ]
  for (const url of urls) {
    const raw = await fetchOnce(url).catch(() => null)
    const found = raw ? exceptTarget(username, extractUsers(raw)) : []
    if (found.length > 0) return found
  }
  return []
}

function withMax(url: string, maxId?: string): string {
  if (!maxId) return url
  const next = new URL(url)
  next.searchParams.set('max_id', maxId)
  return next.toString()
}

async function search(query: string, maxId?: string): Promise<unknown> {
  const url = new URL('https://www.instagram.com/api/v1/fbsearch/web/top_serp/')
  url.searchParams.set('query', query)
  url.searchParams.set('enable_metadata', 'true')
  if (maxId) url.searchParams.set('next_max_id', maxId)
  const primary = await igFetch(url.toString())
  if (maxId || extractItems(primary).length > 0) return primary
  const tag = query.replace(/^#/, '')
  if (!/^[A-Za-z0-9._]+$/.test(tag)) return primary
  try {
    const secondary = await igFetch(`https://www.instagram.com/api/v1/tags/web_info/?tag_name=${encodeURIComponent(tag)}`)
    return extractItems(secondary).length > 0 ? secondary : primary
  } catch {
    return primary
  }
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
    case 'captured':
      scanEmbedded()
      return Array.from(captured.values())
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
const followerCounts = new Map<string, number>()
const scannedScripts = new WeakSet<Element>()

function ingest(raw: unknown): void {
  for (const item of extractItems(raw, 80)) {
    const post = normalizeMedia(item)
    if (post) captured.set(post.id, mergePost(captured.get(post.id), post))
  }
  for (const [username, count] of extractFollowerCounts(raw)) followerCounts.set(username, count)
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
    ingest(await igFetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`))
  } catch {
    return null
  }
  return followerCounts.get(key) ?? null
}

function ingestText(text: string): void {
  for (const body of parseBodies(text)) ingest(body)
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
      if (isInstagramDataUrl(requestUrl(args[0]), location.href)) {
        response
          .clone()
          .text()
          .then(ingestText)
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
    if (this.__ifsUrl && isInstagramDataUrl(this.__ifsUrl, location.href)) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') ingestText(this.responseText)
          else if (this.responseType === 'json') ingest(this.response)
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
      window.postMessage({ source: MAIN_SOURCE, nonce: data.nonce, id: data.id, payload }, window.location.origin)
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Instagram did not answer.'
      const status = error instanceof HttpError ? error.status : 0
      window.postMessage(
        { source: MAIN_SOURCE, nonce: data.nonce, id: data.id, error: message, status },
        window.location.origin,
      )
    })
  })
  hookHistory()
}
