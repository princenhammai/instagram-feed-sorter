import type { Post } from '../types'

export function parseBodies(text: string): unknown[] {
  let body = text.trim()
  if (body.startsWith('for (;;);')) body = body.slice(9).trim()
  if (!body || (body[0] !== '{' && body[0] !== '[')) return []
  try {
    return [JSON.parse(body) as unknown]
  } catch {
    const parsed: unknown[] = []
    for (const line of body.split('\n')) {
      const chunk = line.trim()
      if (!chunk) continue
      try {
        parsed.push(JSON.parse(chunk) as unknown)
      } catch {
        // Streamed responses can end with a partial line.
      }
    }
    return parsed
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
