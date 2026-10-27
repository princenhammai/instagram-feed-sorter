import { extractItems, extractUsers } from './extract'
import { normalizeMedia } from './normalize'
import type { SimilarAccount } from '../types'

function rankToken(): string {
  const digits = Math.floor(Math.random() * 1e15)
    .toString()
    .padStart(15, '0')
  return `0.${digits}`
}

function topSearch(query: string, context: 'user' | 'blended' | 'hashtag'): string {
  const url = new URL('https://www.instagram.com/web/search/topsearch/')
  url.searchParams.set('context', context)
  url.searchParams.set('query', query.trim())
  url.searchParams.set('include_reel', 'true')
  url.searchParams.set('rank_token', rankToken())
  return url.toString()
}

export function accountSearchUrl(query: string): string {
  return topSearch(query, 'blended')
}

export function userSearchUrl(query: string): string {
  return topSearch(query, 'user')
}

export function hashtagUrl(tag: string): string | null {
  const name = tag.trim().replace(/^#+/, '')
  if (!/^[A-Za-z0-9_]{1,50}$/.test(name)) return null
  return `https://www.instagram.com/api/v1/tags/web_info/?tag_name=${encodeURIComponent(name)}`
}

export function accountsInSearch(raw: unknown): SimilarAccount[] {
  const found = extractUsers(raw)
  const seen = new Set(found.map((account) => account.username.toLowerCase()))
  for (const item of extractItems(raw, 8)) {
    const username = normalizeMedia(item)?.username?.trim() ?? ''
    const key = username.toLowerCase()
    if (!username || seen.has(key)) continue
    seen.add(key)
    found.push({
      id: username,
      username,
      fullName: '',
      verified: false,
      url: `https://www.instagram.com/${username}/`,
      followers: null,
      avatarUrl: null,
      isPrivate: false,
      category: null,
      biography: null,
    })
  }
  return found.slice(0, 80)
}
