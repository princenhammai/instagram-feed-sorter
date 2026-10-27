import { scoreAccount, summarizeAccount, type AccountSummary, type StoredReel } from './batch'
import { captionHook } from './research'
import type { Post } from './types'

export const RESEARCH_OPEN_KEY = 'ifs-research-open'
export const TOP_DOWNLOAD = 10
export const VISIBLE_CAP = 250

export type ResearchSort = 'median' | 'engagement' | 'views'
export type ResearchMode = 'batch' | 'snowball'

export interface ReelGroup {
  username: string
  followers: number | null
  reels: StoredReel[]
  provenance?: string
}

export interface ResearchRow {
  username: string
  shortcode: string
  url: string
  hook: string
  views: number | null
  medianScore: number | null
  engagementRate: number | null
  likelyPaid: boolean
  followers: number | null
  provenance: string
  post: Post
}

export function researchRows(groups: ReelGroup[]): ResearchRow[] {
  const rows: ResearchRow[] = []
  for (const group of groups) {
    if (group.reels.length === 0) continue
    for (const post of scoreAccount(group.reels, group.followers)) {
      rows.push({
        username: post.username || group.username,
        shortcode: post.shortcode,
        url: post.url,
        hook: captionHook(post.caption),
        views: post.views,
        medianScore: post.medianScore ?? null,
        engagementRate: post.engagementRate ?? null,
        likelyPaid: Boolean(post.likelyPaid),
        followers: group.followers,
        provenance: group.provenance || '',
        post,
      })
    }
  }
  return rows
}

function sortValue(row: ResearchRow, sort: ResearchSort): number {
  if (sort === 'engagement') return row.engagementRate ?? -1
  if (sort === 'views') return row.views ?? -1
  return row.medianScore ?? -1
}

export function orderResearchRows(rows: ResearchRow[], sort: ResearchSort, hidePaid: boolean): ResearchRow[] {
  const visible = hidePaid ? rows.filter((row) => !row.likelyPaid) : rows
  return [...visible].sort((a, b) => sortValue(b, sort) - sortValue(a, sort) || a.username.localeCompare(b.username) || a.shortcode.localeCompare(b.shortcode))
}

export function researchReelTable(rows: ResearchRow[]): (string | number | null)[][] {
  return [
    ['Account', 'Hook', 'Views', '× median', 'Engagement rate', 'Paid', 'Provenance', 'URL'],
    ...rows.map((row) => [
      row.username,
      row.hook,
      row.views,
      row.medianScore,
      row.engagementRate == null ? null : Math.round(row.engagementRate * 10_000) / 100,
      row.likelyPaid ? 'Yes' : '',
      row.provenance,
      row.url,
    ]),
  ]
}

export function researchSummaries(rows: ResearchRow[]): AccountSummary[] {
  const groups = new Map<string, { username: string; posts: Post[]; followers: number | null }>()
  for (const row of rows) {
    const key = row.username.toLowerCase()
    const group = groups.get(key)
    if (group) {
      group.posts.push(row.post)
      if (group.followers == null && row.followers != null) group.followers = row.followers
      continue
    }
    groups.set(key, { username: row.username, posts: [row.post], followers: row.followers })
  }
  return [...groups.values()].map((group) => summarizeAccount(group.username, group.posts, group.followers))
}
