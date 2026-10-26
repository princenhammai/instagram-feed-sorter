import type { Post } from './types'

/** A post is flagged when its like rate is below this fraction of the set's median like rate. */
export const LOW_LIKE_RATE_RATIO = 0.1

const DISCLOSURE = /#(?:ad|sponsored|paidpartnership|paidpartner)(?![\p{L}\p{N}_])/giu
const HASHTAG = /#[\p{L}\p{N}_]+/gu
const MENTION = /@[\p{L}\p{N}._]+/gu

/** First caption line that still says something after tags and mentions are removed. */
export function captionHook(caption: string, max = 110): string {
  for (const line of caption.split(/\r?\n/)) {
    const cleaned = line.replace(HASHTAG, ' ').replace(MENTION, ' ').replace(/\s+/g, ' ').trim()
    if (cleaned.length < 2) continue
    if (cleaned.length <= max) return cleaned
    return `${cleaned.slice(0, max - 1).trimEnd()}…`
  }
  return ''
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

export function disclosureTags(caption: string): string[] {
  const found: string[] = []
  for (const match of caption.matchAll(DISCLOSURE)) {
    const index = match.index ?? 0
    const previous = index === 0 ? '' : caption[index - 1]
    if (previous && /[\p{L}\p{N}_]/u.test(previous)) continue
    const tag = match[0].toLowerCase()
    if (!found.includes(tag)) found.push(tag)
  }
  return found
}

export function likeRateOf(post: Post): number | null {
  if (post.likes == null || post.views == null || post.views <= 0) return null
  return post.likes / post.views
}

export function commentRateOf(post: Post): number | null {
  if (post.comments == null || post.views == null || post.views <= 0) return null
  return post.comments / post.views
}

export function medianScoreOf(views: number | null | undefined, medianViews: number | null): number | null {
  if (views == null || medianViews == null || medianViews <= 0) return null
  return views / medianViews
}

export function paidSignalsFor(
  post: Post,
  medianLikeRate: number | null,
  medianViews: number | null,
): string[] {
  const signals = [...disclosureTags(post.caption)]
  if (post.paidPartnership) signals.push('paid partnership')
  const rate = likeRateOf(post)
  if (
    rate != null &&
    medianLikeRate != null &&
    medianLikeRate > 0 &&
    medianViews != null &&
    medianViews > 0 &&
    post.views != null &&
    post.views >= medianViews &&
    rate < LOW_LIKE_RATE_RATIO * medianLikeRate
  ) {
    signals.push('low like rate')
  }
  return signals
}

export function withResearch(posts: Post[]): Post[] {
  const medianViews = median(posts.map((post) => post.views).filter((value): value is number => value != null && value >= 0))
  const medianLikeRate = median(posts.map(likeRateOf).filter((value): value is number => value != null))
  return posts.map((post) => {
    const paidSignals = paidSignalsFor(post, medianLikeRate, medianViews)
    return {
      ...post,
      likeRate: likeRateOf(post),
      commentRate: commentRateOf(post),
      medianScore: medianScoreOf(post.views, medianViews),
      paidSignals,
      likelyPaid: paidSignals.length > 0,
    }
  })
}
