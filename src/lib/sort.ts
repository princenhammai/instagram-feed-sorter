import type { Post, SortKey } from './types'

function compareNullable(left: number | null | undefined, right: number | null | undefined): number {
  const a = left == null ? Number.NEGATIVE_INFINITY : left
  const b = right == null ? Number.NEGATIVE_INFINITY : right
  return b - a
}

function metricOf(post: Post, key: SortKey): number | null | undefined {
  switch (key) {
    case 'views':
      return post.views
    case 'comments':
      return post.comments
    case 'outlier':
      return post.outlierScore
    case 'engagement':
      return post.engagementRate
    case 'duration':
      return post.duration
    case 'median':
      return post.medianScore
    case 'likeRate':
      return post.likeRate
    case 'commentRate':
      return post.commentRate
    default:
      return post.likes
  }
}

export function sortPosts(posts: Post[], key: SortKey): Post[] {
  const copy = [...posts]
  copy.sort((a, b) => {
    if (key === 'oldest') return a.takenAt - b.takenAt || a.id.localeCompare(b.id)
    if (key === 'newest') return b.takenAt - a.takenAt || b.id.localeCompare(a.id)
    return compareNullable(metricOf(a, key), metricOf(b, key)) || b.takenAt - a.takenAt
  })
  return copy
}

export function searchPosts(posts: Post[], query: string): Post[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return posts
  return posts.filter((post) => {
    const haystack = `${post.caption} ${post.username} ${post.shortcode} ${post.audio ?? ''}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

export function postsInOrder(posts: Post[], ids: string[]): Post[] {
  const byId = new Map(posts.map((post) => [post.id, post]))
  return ids.flatMap((id) => {
    const post = byId.get(id)
    return post ? [post] : []
  })
}
