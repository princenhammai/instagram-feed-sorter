const RESERVED = new Set([
  'explore',
  'reels',
  'reel',
  'p',
  'stories',
  'accounts',
  'direct',
  'about',
  'legal',
  'directory',
])

export interface PageAccount {
  username: string
  followers: number | null
}

export function usernameFromHandle(value: string): string | null {
  const name = value.trim().replace(/^@/, '')
  if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) return null
  if (RESERVED.has(name.toLowerCase())) return null
  return name
}

export function usernameFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 1) return null
  return usernameFromHandle(parts[0])
}

export function accountsFromHrefs(hrefs: string[]): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const href of hrefs) {
    let pathname = ''
    try {
      pathname = new URL(href, 'https://www.instagram.com').pathname
    } catch {
      continue
    }
    const name = usernameFromPath(pathname)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    found.push(name)
  }
  return found
}

/** Result-column handles, minus accounts that only appear in the sidebar, nav, or suggestions. */
export function visibleSearchAccounts(resultHrefs: string[], chromeHrefs: string[], cap: number): string[] {
  const chrome = new Set(accountsFromHrefs(chromeHrefs).map((name) => name.toLowerCase()))
  return accountsFromHrefs(resultHrefs).filter((name) => !chrome.has(name.toLowerCase())).slice(0, Math.max(0, cap))
}

/**
 * Names come from the result column when it has any.
 * Query-tagged search responses only fill follower counts, or supply names when the column is still empty.
 * Accounts that only exist in the sidebar are never added.
 */
export function accountsFromSearchHits(
  domNames: string[],
  hits: PageAccount[],
  chromeNames: string[],
  cap: number,
): PageAccount[] {
  const chrome = new Set(chromeNames.map((name) => name.toLowerCase()))
  const followers = new Map<string, number | null>()
  for (const hit of hits) {
    const name = usernameFromHandle(hit.username)
    if (!name || chrome.has(name.toLowerCase())) continue
    const key = name.toLowerCase()
    const known = followers.get(key)
    if (known == null) followers.set(key, hit.followers)
  }
  const source = domNames.length > 0 ? domNames : [...followers.keys()]
  const ordered: PageAccount[] = []
  const seen = new Set<string>()
  for (const raw of source) {
    const name = usernameFromHandle(raw)
    if (!name) continue
    const key = name.toLowerCase()
    if (chrome.has(key) || seen.has(key)) continue
    seen.add(key)
    ordered.push({ username: name, followers: followers.get(key) ?? null })
    if (ordered.length >= cap) break
  }
  return ordered
}

/** True when this request belongs to the open keyword search page and carries that query. */
export function requestMatchesKeyword(pageHref: string, requestUrl: string, body: string): boolean {
  let query = ''
  try {
    const page = new URL(pageHref)
    if (!page.pathname.toLowerCase().includes('/explore/search/keyword')) return false
    query = (page.searchParams.get('q') || '').trim().toLowerCase()
  } catch {
    return false
  }
  if (query.length < 2) return false
  return `${requestUrl}\n${body}`.toLowerCase().includes(query)
}

export function searchCaptureNote(keyword: string, usernames: string[]): { status: number; snippet: string; note: string } {
  if (usernames.length === 0) {
    const snippet = 'The search page did not list any accounts.'
    return { status: 0, snippet, note: `No accounts for “${keyword}”. ${snippet}` }
  }
  const handles = usernames.map((name) => `@${name.replace(/^@/, '')}`)
  return {
    status: 200,
    snippet: `${usernames.length} accounts: ${handles.join(', ')}`,
    note: `${keyword}: ${handles.join(', ')}`,
  }
}

export function mergeSearchAccounts(captured: PageAccount[], domUsernames: string[], cap: number): PageAccount[] {
  const byName = new Map<string, PageAccount>()
  for (const account of captured) {
    const name = usernameFromHandle(account.username)
    if (!name) continue
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (!existing || (existing.followers == null && account.followers != null)) {
      byName.set(key, { username: name, followers: account.followers })
    }
  }
  const ordered: PageAccount[] = []
  const seen = new Set<string>()
  for (const raw of [...captured.map((account) => account.username), ...domUsernames]) {
    const name = usernameFromHandle(raw)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const known = byName.get(key)
    ordered.push({ username: known?.username || name, followers: known?.followers ?? null })
    if (ordered.length >= cap) break
  }
  return ordered
}

export function keywordSearchUrl(keyword: string): string {
  const url = new URL('https://www.instagram.com/explore/search/keyword/')
  url.searchParams.set('q', keyword.trim())
  return url.toString()
}

export function isKeywordSearchPage(href: string, keyword: string): boolean {
  try {
    const url = new URL(href)
    if (!url.pathname.toLowerCase().includes('/explore/search/keyword')) return false
    return (url.searchParams.get('q') || '').trim().toLowerCase() === keyword.trim().toLowerCase()
  } catch {
    return false
  }
}
