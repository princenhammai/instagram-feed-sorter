import type { SimilarAccount } from '../types'

/** Later Reels pages are sometimes only `{ code }` with no pk. Real shortcodes are 8–15 characters. */
const CODE_ONLY = /^[A-Za-z0-9_-]{8,15}$/

function mediaCode(raw: object): string {
  const media = raw as { code?: unknown; shortcode?: unknown; media_code?: unknown }
  return String(media.code || media.shortcode || media.media_code || '')
}

export function looksLikeMedia(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const media = raw as { pk?: unknown; id?: unknown }
  const code = mediaCode(raw)
  const id = media.pk ?? media.id
  if (code && id != null && String(id) !== '') return true
  return CODE_ONLY.test(code)
}

function unwrap(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item
  if (looksLikeMedia(item)) return item
  const box = item as { media?: unknown; node?: unknown }
  if (looksLikeMedia(box.media)) return box.media
  if (looksLikeMedia(box.node)) return box.node
  const inner = (box.node as { media?: unknown } | undefined)?.media
  if (looksLikeMedia(inner)) return inner
  return item
}

function mediaIdentity(item: unknown): string {
  const media = item as { code?: unknown; shortcode?: unknown; pk?: unknown; id?: unknown }
  const code = String(media.code || media.shortcode || '')
  if (code) return `code:${code}`
  const id = String(media.pk ?? media.id ?? '')
  return id ? `id:${id}` : ''
}

/**
 * Every media node in the payload, including later pagination pages.
 * A short `items` list must not hide the connection edges beside it.
 * Distinct shortcodes stay distinct even when their numeric pks would collide.
 */
export function extractItems(data: unknown, maxDepth = 14): unknown[] {
  if (!data || typeof data !== 'object') return []
  const found: unknown[] = []
  const seen = new Set<string>()
  const add = (item: unknown) => {
    const media = unwrap(item)
    if (!looksLikeMedia(media)) return
    const key = mediaIdentity(media)
    if (!key || seen.has(key)) return
    seen.add(key)
    found.push(media)
  }
  const walk = (node: unknown, depth: number) => {
    if (!node || depth > maxDepth) return
    if (Array.isArray(node)) {
      for (const item of node) {
        add(item)
        walk(item, depth + 1)
      }
      return
    }
    if (typeof node !== 'object') return
    add(node)
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'carousel_media') continue
      walk(value, depth + 1)
    }
  }
  walk(data, 0)
  return found
}

export function extractFollowerCounts(data: unknown, maxDepth = 40): Map<string, number> {
  const counts = new Map<string, number>()
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > maxDepth) return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    const user = node as { username?: unknown; follower_count?: unknown; edge_followed_by?: { count?: unknown } }
    const count = user.follower_count ?? user.edge_followed_by?.count
    if (typeof user.username === 'string' && typeof count === 'number' && Number.isFinite(count)) {
      counts.set(user.username.toLowerCase(), count)
    }
    for (const value of Object.values(node as Record<string, unknown>)) walk(value, depth + 1)
  }
  walk(data, 0)
  return counts
}

export function extractNext(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const root = data as {
    more_available?: boolean
    next_max_id?: unknown
    paging_info?: { more_available?: boolean; max_id?: unknown }
  }
  const more = root.more_available ?? root.paging_info?.more_available
  if (more === false) return undefined
  const token = root.next_max_id ?? root.paging_info?.max_id
  if (token == null || token === '' || token === 'None') return undefined
  return String(token)
}

export function extractUserId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const root = data as {
    id?: unknown
    user?: { id?: unknown; pk?: unknown }
    data?: { user?: { id?: unknown; pk?: unknown } }
  }
  const id = root.data?.user?.id || root.data?.user?.pk || root.user?.id || root.user?.pk
  if (id == null) return undefined
  const text = String(id)
  return /^\d+$/.test(text) ? text : undefined
}

function asCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function asAccount(raw: unknown): SimilarAccount | null {
  if (!raw || typeof raw !== 'object') return null
  const box = raw as { node?: unknown; user?: unknown }
  const user = (box.node || box.user || raw) as {
    username?: unknown
    pk?: unknown
    pk_id?: unknown
    id?: unknown
    full_name?: unknown
    is_verified?: unknown
    is_private?: unknown
    follower_count?: unknown
    category_name?: unknown
    category?: unknown
    biography?: unknown
    profile_pic_url?: unknown
    hd_profile_pic_url_info?: { url?: unknown }
    edge_followed_by?: { count?: unknown }
  }
  const username = typeof user.username === 'string' ? user.username : ''
  if (!username || username === 'instagram') return null
  const rawId = String(user.pk ?? user.pk_id ?? user.id ?? '')
  const id = /^\d+$/.test(rawId) ? rawId : username
  const avatar =
    (typeof user.profile_pic_url === 'string' && user.profile_pic_url) ||
    (typeof user.hd_profile_pic_url_info?.url === 'string' && user.hd_profile_pic_url_info.url) ||
    null
  const category =
    (typeof user.category_name === 'string' && user.category_name) ||
    (typeof user.category === 'string' && user.category) ||
    null
  return {
    id,
    username,
    fullName: typeof user.full_name === 'string' ? user.full_name : '',
    verified: Boolean(user.is_verified),
    url: `https://www.instagram.com/${username}/`,
    followers: asCount(user.follower_count) ?? asCount(user.edge_followed_by?.count),
    avatarUrl: avatar,
    isPrivate: Boolean(user.is_private),
    category,
    biography: typeof user.biography === 'string' ? user.biography : null,
  }
}

function isRelatedKey(key: string): boolean {
  return (
    key === 'edge_related_profiles' ||
    key === 'edge_chaining' ||
    key === 'edge_suggested_users' ||
    key === 'suggested_users' ||
    key === 'chaining_results' ||
    key.includes('discover__chaining') ||
    key.includes('chaining')
  )
}

function takeList(list: unknown, into: SimilarAccount[], seen: Set<string>): void {
  if (!Array.isArray(list)) return
  for (const item of list) {
    const account = asAccount(item)
    if (!account || seen.has(account.username.toLowerCase())) continue
    seen.add(account.username.toLowerCase())
    into.push(account)
  }
}

function isChromeUserKey(key: string): boolean {
  return isRelatedKey(key) || /suggest|following|follower|friendship|sidebar/i.test(key)
}

/** Accounts from a search payload, skipping suggested, following, and chaining lists. */
export function extractSearchUsers(data: unknown): SimilarAccount[] {
  if (!data || typeof data !== 'object') return []
  const accounts: SimilarAccount[] = []
  const seen = new Set<string>()
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 16) return
    if (Array.isArray(node)) {
      if (node.some((item) => asAccount(item))) takeList(node, accounts, seen)
      for (const item of node) walk(item, depth + 1)
      return
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (isChromeUserKey(key)) continue
      walk(value, depth + 1)
    }
  }
  walk(data, 0)
  return accounts.slice(0, 40)
}

export function extractUsers(data: unknown, loose = true): SimilarAccount[] {
  if (!data || typeof data !== 'object') return []
  const accounts: SimilarAccount[] = []
  const seen = new Set<string>()
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 24) return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    const record = node as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (isRelatedKey(key)) {
        const box = value as { edges?: unknown; users?: unknown; items?: unknown } | undefined
        takeList(box?.edges ?? box?.users ?? box?.items ?? value, accounts, seen)
        continue
      }
      if (loose && key === 'users' && depth <= 8) takeList(value, accounts, seen)
      else walk(value, depth + 1)
    }
  }
  walk(data, 0)
  return accounts.slice(0, 80)
}

export function extractStoryItems(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return []
  const root = data as {
    reels_media?: { items?: unknown[] }[]
    reels?: Record<string, { items?: unknown[] }>
  }
  if (Array.isArray(root.reels_media)) {
    return root.reels_media.flatMap((reel) => reel.items ?? [])
  }
  if (root.reels && typeof root.reels === 'object') {
    return Object.values(root.reels).flatMap((reel) => reel.items ?? [])
  }
  return extractItems(data)
}
