import { instagramIdToMs } from './ids'
import type { MediaKind, Post, Slide } from '../types'

function asCount(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

function bestImage(raw: Raw): string | null {
  const candidates = raw.image_versions2?.candidates || raw.image_versions?.candidates || []
  if (candidates.length > 0) {
    const sorted = [...candidates].sort((a, b) => (b.width || 0) - (a.width || 0))
    return sorted[0]?.url || null
  }
  return raw.display_url || raw.thumbnail_url || raw.thumbnail_src || null
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

function dashVideo(raw: Raw): string | null {
  const xml = raw.video_dash_manifest
  if (typeof xml !== 'string' || !xml.includes('<BaseURL>')) return null
  const ranked = [...xml.matchAll(/bandwidth="(\d+)"[^>]*>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/g)]
    .map((match) => ({ bandwidth: Number(match[1]), url: decodeXml(match[2]) }))
    .filter((item) => item.url.startsWith('https://') && /\.mp4/i.test(item.url))
    .sort((a, b) => b.bandwidth - a.bandwidth)
  return ranked[0]?.url ?? null
}

function bestVideo(raw: Raw): string | null {
  const versions = raw.video_versions
  if (versions && versions.length > 0) {
    const sorted = [...versions].sort((a, b) => (b.width || 0) - (a.width || 0))
    if (sorted[0]?.url) return sorted[0].url
  }
  return raw.video_url || dashVideo(raw)
}

function smallestVideo(raw: Raw): string | null {
  const versions = raw.video_versions
  if (!versions || versions.length < 2) return null
  const sorted = [...versions].sort((a, b) => (a.width || 0) - (b.width || 0))
  return sorted[0]?.url || null
}

function captionOf(raw: Raw): string {
  if (typeof raw.caption === 'string') return raw.caption
  if (raw.caption && typeof raw.caption === 'object' && typeof raw.caption.text === 'string') return raw.caption.text
  const edge = raw.edge_media_to_caption?.edges?.[0]?.node?.text
  return typeof edge === 'string' ? edge : ''
}

function takenAtOf(raw: Raw, id: string): number {
  const seconds = asCount(raw.taken_at, raw.taken_at_timestamp)
  if (seconds && seconds > 1_000_000_000 && seconds < 10_000_000_000) return seconds * 1000
  if (seconds && seconds > 1_000_000_000_000) return seconds
  return instagramIdToMs(id)
}

interface ImageCandidate {
  url?: string
  width?: number
}

interface Raw {
  pk?: string | number
  id?: string | number
  code?: string
  shortcode?: string
  media_type?: number
  product_type?: string
  taken_at?: number
  taken_at_timestamp?: number
  like_count?: number
  comment_count?: number
  play_count?: number
  ig_play_count?: number
  view_count?: number
  video_view_count?: number
  video_play_count?: number
  fb_play_count?: number
  video_url?: string
  video_duration?: number
  video_dash_manifest?: string
  display_url?: string
  thumbnail_url?: string
  thumbnail_src?: string
  caption?: string | { text?: string; user?: { username?: string } } | null
  user?: { username?: string }
  owner?: { username?: string }
  image_versions2?: { candidates?: ImageCandidate[] }
  image_versions?: { candidates?: ImageCandidate[] }
  video_versions?: { url?: string; width?: number }[]
  carousel_media?: Raw[]
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] }
  edge_liked_by?: { count?: number }
  edge_media_preview_like?: { count?: number }
  edge_media_to_comment?: { count?: number }
  is_paid_partnership?: boolean
  sponsor_tags?: unknown[]
  clips_metadata?: ClipsAudio
  music_metadata?: ClipsAudio
  clips_music_attribution_info?: {
    artist_name?: string
    song_name?: string
    uses_original_audio?: boolean
  }
}

interface MusicAsset {
  title?: string
  display_artist?: string
}

interface ClipsAudio {
  video_duration?: number
  music_info?: { music_asset_info?: MusicAsset }
  original_sound_info?: {
    original_audio_title?: string
    ig_artist?: { username?: string }
  }
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function joinTitle(title: string, artist: string): string {
  if (!title) return ''
  if (!artist || artist.toLowerCase() === title.toLowerCase()) return title
  return `${title} — ${artist}`
}

export function audioLabel(raw: Raw): string | null {
  const music = raw.clips_metadata?.music_info?.music_asset_info ?? raw.music_metadata?.music_info?.music_asset_info
  const credited = joinTitle(
    textField(music?.title) || textField(raw.clips_music_attribution_info?.song_name),
    textField(music?.display_artist) || textField(raw.clips_music_attribution_info?.artist_name),
  )
  if (credited) return credited.slice(0, 180)

  const original = raw.clips_metadata?.original_sound_info ?? raw.music_metadata?.original_sound_info
  const originalTitle = joinTitle(textField(original?.original_audio_title), textField(original?.ig_artist?.username))
  if (originalTitle) return originalTitle.slice(0, 180)
  if (raw.clips_music_attribution_info?.uses_original_audio) {
    const artist = textField(raw.clips_music_attribution_info.artist_name)
    return artist ? `Original audio — ${artist}`.slice(0, 180) : 'Original audio'
  }
  return null
}

function paidPartnershipOf(raw: Raw): boolean {
  if (raw.is_paid_partnership === true) return true
  return Array.isArray(raw.sponsor_tags) && raw.sponsor_tags.length > 0
}

function durationOf(raw: Raw): number | null {
  return asCount(raw.video_duration, raw.clips_metadata?.video_duration)
}

function slidesOf(items: Raw[]): Slide[] {
  const slides: Slide[] = []
  for (const item of items) {
    const video = bestVideo(item)
    if (video) {
      slides.push({ kind: 'video', url: video })
      continue
    }
    const image = bestImage(item)
    if (image) slides.push({ kind: 'image', url: image })
  }
  return slides
}

export function normalizeMedia(raw: unknown, fallbackUsername = ''): Post | null {
  if (!raw || typeof raw !== 'object') return null
  const media = raw as Raw
  const id = String(media.pk ?? media.id ?? '').split('_')[0]
  const shortcode = String(media.code || media.shortcode || id || '')
  if (!id || !shortcode) return null

  const carousel = Array.isArray(media.carousel_media) && media.carousel_media.length > 0
  const slides = carousel ? slidesOf(media.carousel_media ?? []) : []
  const videoUrl = carousel ? null : bestVideo(media)
  const clip =
    media.product_type === 'clips' ||
    media.product_type === 'igtv' ||
    media.product_type === 'reel' ||
    media.product_type === 'clips_preview'
  let mediaKind: MediaKind = 'image'
  if (carousel && slides.length > 0) mediaKind = 'carousel'
  else if (videoUrl || media.media_type === 2 || clip) mediaKind = 'video'

  const reel = clip || mediaKind === 'video'
  const captionUser = media.caption && typeof media.caption === 'object' ? media.caption.user?.username : ''
  const username = media.user?.username || media.owner?.username || captionUser || fallbackUsername || ''

  return {
    id,
    shortcode,
    username,
    url: `https://www.instagram.com/${reel ? 'reel' : 'p'}/${shortcode}/`,
    caption: captionOf(media),
    takenAt: takenAtOf(media, id),
    likes: asCount(media.like_count, media.edge_liked_by?.count, media.edge_media_preview_like?.count),
    comments: asCount(media.comment_count, media.edge_media_to_comment?.count),
    views: asCount(
      media.play_count,
      media.ig_play_count,
      media.view_count,
      media.video_view_count,
      media.video_play_count,
      media.fb_play_count,
    ),
    mediaKind,
    coverUrl: bestImage(media) || slides.find((slide) => slide.kind === 'image')?.url || null,
    videoUrl,
    slides,
    duration: durationOf(media),
    audio: audioLabel(media),
    paidPartnership: paidPartnershipOf(media),
    videoLowUrl: carousel ? null : smallestVideo(media),
  }
}

export function normalizeStoryItem(raw: unknown, username: string): Post | null {
  const post = normalizeMedia(raw, username)
  if (!post) return null
  return {
    ...post,
    username: post.username || username,
    url: `https://www.instagram.com/stories/${username}/${post.id}/`,
  }
}
