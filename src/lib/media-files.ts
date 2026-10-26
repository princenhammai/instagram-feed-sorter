import type { Post, Surface } from './types'

export function isAllowedMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname
    return (
      host === 'instagram.com' ||
      host === 'www.instagram.com' ||
      host.endsWith('.cdninstagram.com') ||
      host.endsWith('.fbcdn.net')
    )
  } catch {
    return false
  }
}

export function isInstagramUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (parsed.hostname === 'www.instagram.com' || parsed.hostname === 'instagram.com')
  } catch {
    return false
  }
}

export function safeSegment(value: string): string {
  const clean = value
    .normalize('NFKC')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  return clean || 'instagram'
}

export const DOWNLOAD_ROOT = 'Instagram Feed Sorter'

export function postFileBase(post: Post): string {
  return `${safeSegment(post.username || 'instagram')}-${safeSegment(post.shortcode || post.id)}`
}

export function zipStem(surface: Surface): string {
  switch (surface.kind) {
    case 'reels':
      return `${surface.username}-reels`
    case 'posts':
      return `${surface.username}-posts`
    case 'explore-search':
      return `search-${surface.query}`
    case 'saved-all':
      return `${surface.username}-saved`
    case 'saved-collection':
      return `${surface.username}-${surface.slug}`
    case 'stories':
      return `${surface.username}-stories`
    case 'post':
      return surface.shortcode
    default:
      return 'instagram'
  }
}

export interface RemoteFile {
  name: string
  url: string
}

export function filesForPost(post: Post, order?: number): RemoteFile[] {
  const rank = order == null ? '' : `${String(order + 1).padStart(3, '0')}-`
  const base = `${rank}${postFileBase(post)}`
  if (post.mediaKind === 'carousel' && post.slides.length > 1) {
    return post.slides
      .filter((slide) => isAllowedMediaUrl(slide.url))
      .map((slide, index) => ({
        name: `${base}/${base}-${index + 1}.${slide.kind === 'video' ? 'mp4' : 'jpg'}`,
        url: slide.url,
      }))
  }
  const video = post.videoUrl || post.slides.find((slide) => slide.kind === 'video')?.url
  if ((post.mediaKind === 'video' || post.videoUrl) && video && isAllowedMediaUrl(video)) {
    return [{ name: `${base}.mp4`, url: video }]
  }
  if (post.mediaKind === 'video') return []
  if (post.coverUrl && isAllowedMediaUrl(post.coverUrl)) return [{ name: `${base}.jpg`, url: post.coverUrl }]
  if (post.slides[0] && isAllowedMediaUrl(post.slides[0].url)) {
    const slide = post.slides[0]
    return [{ name: `${base}.${slide.kind === 'video' ? 'mp4' : 'jpg'}`, url: slide.url }]
  }
  return []
}

export function needsZip(posts: Post[]): boolean {
  if (posts.length !== 1) return true
  return filesForPost(posts[0]).length !== 1
}

export function downloadName(filename: string): string {
  const cleaned = filename.replace(/\.\./g, '').replace(/^\/+/, '')
  return cleaned.startsWith(`${DOWNLOAD_ROOT}/`) ? cleaned : `${DOWNLOAD_ROOT}/${cleaned}`
}
