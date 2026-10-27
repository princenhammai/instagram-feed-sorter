/**
 * What a Reels page already told us about that account.
 * Expansion reads this after the tab has moved on. It never calls web_profile_info.
 */
export const PROFILE_CACHE_KEY = 'ifs-profile-cache'

export interface ProfileSuggestion {
  username: string
  followers: number | null
}

export interface ProfileMemory {
  id?: string
  followers: number | null
  suggested: ProfileSuggestion[]
}

export interface ProfileStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function emptyMemory(): ProfileMemory {
  return { followers: null, suggested: [] }
}

export function mergeMemory(previous: ProfileMemory | undefined, patch: Partial<ProfileMemory>): ProfileMemory {
  const base = previous ?? emptyMemory()
  const suggested = patch.suggested && patch.suggested.length > 0 ? patch.suggested : base.suggested
  return {
    id: patch.id || base.id,
    followers: patch.followers !== undefined ? patch.followers : base.followers,
    suggested,
  }
}

export function readProfileCache(storage: ProfileStorage): Record<string, ProfileMemory> {
  try {
    const raw = JSON.parse(storage.getItem(PROFILE_CACHE_KEY) || '') as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return raw as Record<string, ProfileMemory>
  } catch {
    return {}
  }
}

export function rememberProfile(storage: ProfileStorage, username: string, patch: Partial<ProfileMemory>): ProfileMemory {
  const key = username.trim().toLowerCase()
  const all = readProfileCache(storage)
  const next = mergeMemory(all[key], patch)
  all[key] = next
  try {
    storage.setItem(PROFILE_CACHE_KEY, JSON.stringify(all))
  } catch {
    // The in-memory merge still stands for this document. A full navigation needs sessionStorage.
  }
  return next
}

export function profileMemory(storage: ProfileStorage, username: string): ProfileMemory | undefined {
  const saved = readProfileCache(storage)[username.trim().toLowerCase()]
  return saved
}

/** Chaining only when the page did not already include suggested accounts and an id was saved. */
export function similarRequest(memory: ProfileMemory | undefined): string | null {
  if (!memory?.id || memory.suggested.length > 0) return null
  return `https://www.instagram.com/api/v1/discover/chaining/?target_id=${encodeURIComponent(memory.id)}&module=profile`
}

/** Following list only when the Reels page already yielded an id. */
export function followingRequest(memory: ProfileMemory | undefined, maxId?: string): string | null {
  if (!memory?.id) return null
  const url = new URL(`https://www.instagram.com/api/v1/friendships/${encodeURIComponent(memory.id)}/following/`)
  url.searchParams.set('count', '12')
  if (maxId) url.searchParams.set('max_id', maxId)
  return url.toString()
}

export function expansionUrls(memory: ProfileMemory | undefined, maxId?: string): string[] {
  return [similarRequest(memory), followingRequest(memory, maxId)].filter((url): url is string => Boolean(url))
}
