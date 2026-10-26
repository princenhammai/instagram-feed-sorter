import type { Post } from './types'

export const GRID_IDLE_ROUNDS = 6

export function reelsForAccount(posts: Post[], username: string): Post[] {
  const want = username.trim().toLowerCase()
  const seen = new Set<string>()
  const found: Post[] = []
  for (const post of posts) {
    const owner = post.username.trim().toLowerCase()
    if (owner && owner !== want) continue
    const reel = post.mediaKind === 'video' || post.url.includes('/reel/')
    if (!reel) continue
    const key = (post.shortcode || post.id).toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    found.push(owner ? post : { ...post, username })
  }
  return found
}

export function nextIdle(previousCount: number, nextCount: number, idle: number): number {
  return nextCount > previousCount ? 0 : idle + 1
}
