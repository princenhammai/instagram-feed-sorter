import { callMain } from './bridge'
import { extractItems, extractNext, extractStoryItems, extractUserId, extractUsers } from '../lib/instagram/extract'
import { shortcodeToId } from '../lib/instagram/ids'
import { fillMissingMedia } from '../lib/instagram/capture'
import { normalizeMedia, normalizeStoryItem } from '../lib/instagram/normalize'
import { accountsInSearch } from '../lib/instagram/search'
import { isRateLimit } from '../lib/instagram/page-data'
import type { PageBatch } from '../lib/instagram/collect'
import type { Post, SimilarAccount, SortableSurface } from '../lib/types'

function normalizeList(raw: unknown): Post[] {
  const posts: Post[] = []
  const seen = new Set<string>()
  for (const item of extractItems(raw)) {
    const post = normalizeMedia(item)
    if (!post || seen.has(post.id)) continue
    seen.add(post.id)
    posts.push(post)
  }
  return posts
}

function keepAuthor(posts: Post[], username: string): Post[] {
  const want = username.toLowerCase()
  return posts
    .map((post) => ({ ...post, username: post.username || username }))
    .filter((post) => post.username.toLowerCase() === want)
}

async function userId(username: string): Promise<string> {
  const raw = await callMain({ action: 'profile', username })
  const id = extractUserId(raw)
  if (!id) {
    throw new Error("Instagram didn't return that profile. It may be private, or you may need to refresh and sign in.")
  }
  return id
}

const profileIds = new Map<string, string>()

async function cachedUserId(username: string): Promise<string> {
  const existing = profileIds.get(username.toLowerCase())
  if (existing) return existing
  const id = await userId(username)
  profileIds.set(username.toLowerCase(), id)
  return id
}

const reelsFromFeed = new Set<string>()

export function resetReelsSource(username: string): void {
  reelsFromFeed.delete(username.toLowerCase())
}

async function reelsFromMainFeed(id: string, username: string, maxId: string | undefined): Promise<PageBatch> {
  const raw = await callMain({ action: 'feed', userId: id, maxId })
  const videos = keepAuthor(normalizeList(raw), username).filter((post) => post.mediaKind === 'video')
  return { posts: videos, nextMaxId: extractNext(raw) }
}

export async function loadPage(surface: SortableSurface, maxId: string | undefined): Promise<PageBatch> {
  if (surface.kind === 'reels') {
    const id = await cachedUserId(surface.username)
    const key = surface.username.toLowerCase()
    if (reelsFromFeed.has(key)) return reelsFromMainFeed(id, surface.username, maxId)
    try {
      const raw = await callMain({ action: 'clips', userId: id, maxId })
      return { posts: keepAuthor(normalizeList(raw), surface.username), nextMaxId: extractNext(raw) }
    } catch (error) {
      if (maxId || isRateLimit(error)) throw error
      reelsFromFeed.add(key)
      return reelsFromMainFeed(id, surface.username, undefined)
    }
  }
  if (surface.kind === 'posts') {
    const id = await cachedUserId(surface.username)
    const raw = await callMain({ action: 'feed', userId: id, maxId })
    return { posts: keepAuthor(normalizeList(raw), surface.username), nextMaxId: extractNext(raw) }
  }
  if (surface.kind === 'saved-all') {
    const raw = await callMain({ action: 'saved', maxId })
    return { posts: normalizeList(raw), nextMaxId: extractNext(raw) }
  }
  if (surface.kind === 'saved-collection') {
    const raw = await callMain({ action: 'collection', collectionId: surface.collectionId, maxId })
    return { posts: normalizeList(raw), nextMaxId: extractNext(raw) }
  }
  const raw = await callMain({ action: 'search', query: surface.query, maxId })
  return { posts: normalizeList(raw), nextMaxId: extractNext(raw) }
}

export async function mediaByShortcode(code: string): Promise<Post | null> {
  const raw = await callMain({ action: 'media', mediaId: shortcodeToId(code) })
  return normalizeList(raw)[0] ?? null
}

export function hasPlayableVideo(post: Post): boolean {
  return Boolean(post.videoUrl || post.slides.some((slide) => slide.kind === 'video'))
}

export async function enrichPost(post: Post): Promise<Post> {
  const id = /^\d+$/.test(post.id) ? post.id : shortcodeToId(post.shortcode)
  const raw = await callMain({ action: 'media', mediaId: id })
  const detailed = normalizeList(raw)[0]
  return detailed ? fillMissingMedia(post, detailed) : post
}

export async function storyPosts(username: string): Promise<Post[]> {
  const id = await cachedUserId(username)
  const raw = await callMain({ action: 'stories', userId: id })
  const posts: Post[] = []
  for (const item of extractStoryItems(raw)) {
    const post = normalizeStoryItem(item, username)
    if (post) posts.push(post)
  }
  return posts
}

export async function followerCount(username: string): Promise<number | null> {
  const raw = await callMain({ action: 'followers', username })
  return typeof raw === 'number' ? raw : null
}

export async function followingPage(username: string, maxId?: string): Promise<{ accounts: SimilarAccount[]; nextMaxId?: string }> {
  const raw = await callMain({ action: 'following', username, maxId })
  return { accounts: extractUsers(raw), nextMaxId: extractNext(raw) }
}

export async function searchUsers(query: string): Promise<SimilarAccount[]> {
  return accountsInSearch(await callMain({ action: 'user-search', query }))
}

export async function searchReels(query: string): Promise<SimilarAccount[]> {
  return accountsInSearch(await callMain({ action: 'reels-search', query }))
}

export async function searchHashtag(query: string): Promise<SimilarAccount[]> {
  return accountsInSearch(await callMain({ action: 'hashtag', query }))
}

export async function similarAccounts(username: string): Promise<SimilarAccount[]> {
  const raw = await callMain({ action: 'similar', username }, 22000)
  if (!Array.isArray(raw)) return extractUsers(raw)
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const account = item as SimilarAccount
    return typeof account.username === 'string' && account.username ? [account] : []
  })
}
