import type { RangeChoice, Surface } from './types'

export function datePhrase(choice: RangeChoice): string | null {
  switch (choice.date) {
    case '7d':
      return '1 week back'
    case '30d':
      return '1 month back'
    case '90d':
      return '3 months back'
    case '180d':
      return '6 months back'
    case '365d':
      return '1 year back'
    case 'custom':
      return 'a custom range'
    default:
      return null
  }
}

export function headline(surface: Surface, choice: RangeChoice): string {
  const count = choice.count === 'all' ? null : String(choice.count)
  const when = datePhrase(choice)
  if (surface.kind === 'saved-collection') {
    const name = surface.slug.replace(/-/g, ' ')
    return count ? `${count} posts from ${name}` : name
  }
  if (surface.kind === 'saved-all') return count ? `${count} saved posts` : 'Saved posts'
  if (surface.kind === 'explore-search') {
    return count ? `${count} posts for “${surface.query}”` : `Posts for “${surface.query}”`
  }
  const noun = surface.kind === 'reels' ? 'Reels' : 'Posts'
  if (count && when) return `${count} ${noun} from ${when}`
  if (count) return `${count} ${noun}`
  if (when) return `${noun} from ${when}`
  return noun
}
