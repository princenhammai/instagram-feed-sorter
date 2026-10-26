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
