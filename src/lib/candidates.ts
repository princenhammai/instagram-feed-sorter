import type { SimilarAccount } from './types'

export const CANDIDATE_KEY = 'ifs-candidates'
export const MAX_FOLLOWING = 200
export const DEFAULT_FOLLOWING = 50
export const MAX_CHAIN = 8

export interface Candidate {
  username: string
  fullName: string
  source: string
  followers: number | null
  seenAt: number
}

export function candidateFromAccount(account: SimilarAccount, source: string, seenAt = Date.now()): Candidate {
  return {
    username: account.username,
    fullName: account.fullName,
    source,
    followers: account.followers,
    seenAt,
  }
}

export function mergeCandidates(existing: Candidate[], incoming: Candidate[]): { all: Candidate[]; added: Candidate[] } {
  const all = existing.map((item) => ({ ...item }))
  const index = new Map(all.map((item, position) => [item.username.toLowerCase(), position]))
  const added: Candidate[] = []
  for (const candidate of incoming) {
    const key = candidate.username.toLowerCase()
    const at = index.get(key)
    if (at == null) {
      index.set(key, all.length)
      all.push(candidate)
      added.push(candidate)
      continue
    }
    const current = all[at]
    if (current.followers == null && candidate.followers != null) current.followers = candidate.followers
    if (!current.fullName && candidate.fullName) current.fullName = candidate.fullName
  }
  return { all, added }
}

export function candidateTable(candidates: Candidate[]): (string | number | null)[][] {
  return [
    ['Username', 'Full name', 'Source', 'Followers', 'Profile'],
    ...candidates.map((candidate) => [
      candidate.username,
      candidate.fullName,
      candidate.source,
      candidate.followers,
      `https://www.instagram.com/${candidate.username}/`,
    ]),
  ]
}

export function clampFollowing(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FOLLOWING
  return Math.min(MAX_FOLLOWING, Math.max(0, Math.round(value)))
}

export function clampChain(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_CHAIN, Math.max(0, Math.round(value)))
}

export function visibleHandles(hrefs: string[], reserved: ReadonlySet<string>): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const href of hrefs) {
    const match = href.match(/^\/([A-Za-z0-9._]{1,30})\/?$/)
    const name = match?.[1]
    if (!name || reserved.has(name.toLowerCase()) || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    found.push(name)
  }
  return found
}
