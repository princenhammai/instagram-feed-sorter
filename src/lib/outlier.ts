import type { Post } from './types'

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

export function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function computeOutlierScores(
  posts: Post[],
  metric: 'views' | 'likes',
  now = Date.now(),
): Map<string, number | null> {
  const recent = [...posts].sort((a, b) => b.takenAt - a.takenAt).slice(0, 25)
  const baseline = recent
    .filter((post) => post.takenAt > 0 && now - post.takenAt >= THREE_DAYS)
    .map((post) => post[metric])
    .filter((value): value is number => value != null && value >= 0)

  const scores = new Map<string, number | null>()
  if (baseline.length === 0) {
    for (const post of posts) scores.set(post.id, null)
    return scores
  }
  const mean = average(baseline)
  for (const post of posts) {
    const value = post[metric]
    scores.set(post.id, value == null || mean <= 0 ? null : value / mean)
  }
  return scores
}

export function withOutlierScores(posts: Post[], metric: 'views' | 'likes' | null, now = Date.now()): Post[] {
  if (!metric) return posts.map((post) => ({ ...post, outlierScore: null }))
  const scores = computeOutlierScores(posts, metric, now)
  return posts.map((post) => ({ ...post, outlierScore: scores.get(post.id) ?? null }))
}

export function engagementRate(post: Post, followers: number | null): number | null {
  if (post.likes == null && post.comments == null) return null
  const interactions = (post.likes ?? 0) + (post.comments ?? 0)
  if (post.views != null && post.views > 0) return interactions / post.views
  if (followers != null && followers > 0) return interactions / followers
  return null
}

export function withEngagement(posts: Post[], followers: number | null): Post[] {
  return posts.map((post) => ({ ...post, engagementRate: engagementRate(post, followers) }))
}

export function boltTiers(posts: Post[]): Map<string, 1 | 2 | 3> {
  const ranked = posts
    .filter((post) => (post.outlierScore ?? 0) >= 2)
    .sort((a, b) => (b.outlierScore ?? 0) - (a.outlierScore ?? 0))
    .slice(0, 6)
  const tiers = new Map<string, 1 | 2 | 3>()
  ranked.forEach((post, index) => {
    tiers.set(post.id, index === 0 ? 3 : index < 3 ? 2 : 1)
  })
  return tiers
}
