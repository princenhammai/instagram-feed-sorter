import { SORT_KEYS, type SortableSurface, type SortKey, type Surface } from './types'

const RESERVED = new Set([
  'explore',
  'direct',
  'accounts',
  'stories',
  'reels',
  'reel',
  'p',
  'about',
  'legal',
  'emails',
  'challenge',
  'privacy',
  'directory',
  'lite',
  'nametag',
  'your_activity',
  'archive',
  'developer',
  'ads',
  'graphql',
  'api',
])

export function parseSurface(href: string): Surface {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { kind: 'other' }
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'instagram.com') return { kind: 'other' }

  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length === 0) return { kind: 'other' }

  if ((parts[0] === 'p' || parts[0] === 'reel') && parts[1]) {
    return { kind: 'post', shortcode: parts[1] }
  }
  if (parts[0] === 'reels' && parts[1]) return { kind: 'post', shortcode: parts[1] }
  if (parts[0] === 'stories' && parts[1]) {
    return { kind: 'stories', username: parts[1], storyId: parts[2] }
  }
  if (parts[0] === 'explore') {
    if (parts[1] === 'tags' && parts[2]) return { kind: 'explore-search', query: parts[2] }
    if (parts[1] === 'search') {
      const query = url.searchParams.get('q')?.trim() ?? ''
      if (!query) return { kind: 'other' }
      return { kind: 'explore-search', query }
    }
    return { kind: 'other' }
  }
  if (RESERVED.has(parts[0].toLowerCase())) return { kind: 'other' }

  const username = parts[0]
  if (parts.length === 1) return { kind: 'posts', username }
  if (parts[1] === 'reels' && parts.length === 2) return { kind: 'reels', username }
  if (parts[1] === 'saved') {
    if (parts.length === 2 || parts[2] === 'all-posts') return { kind: 'saved-all', username }
    if (parts[2] && parts[3] && /^\d+$/.test(parts[3])) {
      return {
        kind: 'saved-collection',
        username,
        slug: parts[2],
        collectionId: parts[3],
      }
    }
    return { kind: 'other' }
  }
  return { kind: 'other' }
}

export function isSortable(surface: Surface): surface is SortableSurface {
  return (
    surface.kind === 'posts' ||
    surface.kind === 'reels' ||
    surface.kind === 'explore-search' ||
    surface.kind === 'saved-all' ||
    surface.kind === 'saved-collection'
  )
}

export function allowedSorts(surface: Surface): SortKey[] {
  if (!isSortable(surface)) return []
  if (outlierAllowed(surface)) return [...SORT_KEYS]
  return SORT_KEYS.filter((key) => key !== 'outlier')
}

export function dateFilterAllowed(surface: Surface): boolean {
  return surface.kind === 'posts' || surface.kind === 'reels'
}

export function countAllAllowed(surface: Surface): boolean {
  return isSortable(surface)
}

export function similarAllowed(surface: Surface): boolean {
  return surface.kind === 'posts' || surface.kind === 'reels'
}

export function outlierAllowed(surface: Surface): boolean {
  return surface.kind === 'posts' || surface.kind === 'reels'
}

export function defaultSort(surface: Surface): SortKey {
  const allowed = allowedSorts(surface)
  if (surface.kind === 'reels' && allowed.includes('views')) return 'views'
  if (allowed.includes('likes')) return 'likes'
  return allowed[0] ?? 'likes'
}

export function sortBlockReason(surface: Surface, key: SortKey): string | null {
  if (allowedSorts(surface).includes(key)) return null
  if (key === 'outlier') {
    return 'Outlier score only works on one profile, where every post belongs to the same creator.'
  }
  return 'That sort is not available on this page.'
}

export function surfaceTitle(surface: Surface): string {
  switch (surface.kind) {
    case 'posts':
      return `Posts · @${surface.username}`
    case 'reels':
      return `Reels · @${surface.username}`
    case 'explore-search':
      return `Search · ${surface.query}`
    case 'saved-all':
      return `Saved · @${surface.username}`
    case 'saved-collection':
      return `Saved · ${surface.slug.replace(/-/g, ' ')}`
    case 'stories':
      return `Story · @${surface.username}`
    case 'post':
      return 'This post'
    default:
      return 'Choose a feed'
  }
}
