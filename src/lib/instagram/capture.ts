import { extractItems } from './extract'
import { normalizeMedia } from './normalize'
import type { Post } from '../types'

/** Instagram media ids are larger than Number can keep distinct. Quote them before JSON.parse. */
const LARGE_ID = /("(?:pk|pk_id|id|media_id|fbid|strong_id__)"\s*:\s*)(\d{16,})(?=\s*[,}\]])/g

export function quoteLargeIds(text: string): string {
  return text.replace(LARGE_ID, '$1"$2"')
}

function parseJson(body: string): unknown {
  return JSON.parse(quoteLargeIds(body)) as unknown
}

export function parseBodies(text: string): unknown[] {
  let body = text.trim()
  if (body.startsWith('for (;;);')) body = body.slice(9).trim()
  if (!body || (body[0] !== '{' && body[0] !== '[')) return []
  try {
    return [parseJson(body)]
  } catch {
    const parsed: unknown[] = []
    for (const line of body.split('\n')) {
      const chunk = line.trim()
      if (!chunk) continue
      try {
        parsed.push(parseJson(chunk))
      } catch {
        // Streamed responses can end with a partial line.
      }
    }
    return parsed
  }
}

/** Keep every distinct shortcode. A numeric pk is not the key, because nearby ids collapse in JSON numbers. */
export function rememberPosts(into: Map<string, Post>, raw: unknown, fallbackUsername = ''): void {
  for (const item of extractItems(raw, 80)) {
    const post = normalizeMedia(item, fallbackUsername)
    if (!post) continue
    const key = post.shortcode || post.id
    into.set(key, mergePost(into.get(key), post))
  }
}

export function fillMissingMedia(current: Post, extra: Post): Post {
  return {
    ...current,
    username: current.username || extra.username,
    caption: current.caption || extra.caption,
    videoUrl: current.videoUrl || extra.videoUrl,
    videoLowUrl: current.videoLowUrl || extra.videoLowUrl,
    coverUrl: current.coverUrl || extra.coverUrl,
    duration: current.duration ?? extra.duration ?? null,
    audio: current.audio || extra.audio || null,
    paidPartnership: Boolean(current.paidPartnership || extra.paidPartnership),
    views: current.views ?? extra.views,
    likes: current.likes ?? extra.likes,
    comments: current.comments ?? extra.comments,
    slides: current.slides.length > 0 ? current.slides : extra.slides,
    mediaKind: current.mediaKind === 'image' && extra.mediaKind !== 'image' ? extra.mediaKind : current.mediaKind,
  }
}

export function mergePost(previous: Post | undefined, next: Post): Post {
  if (!previous) return next
  const merged: Post = { ...previous }
  for (const [key, value] of Object.entries(next) as [keyof Post, Post[keyof Post]][]) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue
    ;(merged as unknown as Record<string, unknown>)[key] = value
  }
  return merged
}

export function isInstagramDataUrl(url: string, base: string): boolean {
  try {
    const parsed = new URL(url, base)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host !== 'instagram.com') return false
    return parsed.pathname.startsWith('/graphql') || parsed.pathname.startsWith('/api/')
  } catch {
    return false
  }
}
