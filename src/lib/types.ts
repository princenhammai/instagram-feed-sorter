export type SortKey = 'views' | 'likes' | 'comments' | 'outlier' | 'engagement' | 'newest' | 'oldest'

export const SORT_KEYS: SortKey[] = ['views', 'likes', 'comments', 'outlier', 'engagement', 'newest', 'oldest']

export type MediaKind = 'image' | 'video' | 'carousel'

export interface Slide {
  kind: 'image' | 'video'
  url: string
}

export interface Post {
  id: string
  shortcode: string
  username: string
  url: string
  caption: string
  takenAt: number
  likes: number | null
  comments: number | null
  views: number | null
  mediaKind: MediaKind
  coverUrl: string | null
  videoUrl: string | null
  slides: Slide[]
  duration?: number | null
  videoLowUrl?: string | null
  outlierScore?: number | null
  engagementRate?: number | null
}

export type Surface =
  | { kind: 'posts'; username: string }
  | { kind: 'reels'; username: string }
  | { kind: 'explore-search'; query: string }
  | { kind: 'saved-all'; username: string }
  | { kind: 'saved-collection'; username: string; slug: string; collectionId: string }
  | { kind: 'stories'; username: string; storyId?: string }
  | { kind: 'post'; shortcode: string }
  | { kind: 'other' }

export type SortableKind = 'posts' | 'reels' | 'explore-search' | 'saved-all' | 'saved-collection'

export type SortableSurface = Extract<Surface, { kind: SortableKind }>

export const DATE_PRESETS = ['none', '7d', '30d', '90d', '180d', '365d', 'all', 'custom'] as const

export type DatePreset = (typeof DATE_PRESETS)[number]

export interface RangeChoice {
  count: number | 'all'
  date: DatePreset
  start?: number
  end?: number
}

export interface SimilarAccount {
  id: string
  username: string
  fullName: string
  verified: boolean
  url: string
  followers: number | null
  avatarUrl: string | null
  isPrivate: boolean
  category: string | null
  biography: string | null
}

export interface Settings {
  openMode: 'player' | 'instagram'
  showDownload: boolean
  showSave: boolean
  transcribeKey: string
  transcribeEndpoint: string
  transcribeModel: string
}

export const DEFAULT_TRANSCRIBE_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'

export const DEFAULT_SETTINGS: Settings = {
  openMode: 'player',
  showDownload: true,
  showSave: true,
  transcribeKey: '',
  transcribeEndpoint: DEFAULT_TRANSCRIBE_ENDPOINT,
  transcribeModel: 'whisper-1',
}

export const SAFETY_CAP = 100_000

export const SETTINGS_KEY = 'ifs-settings'
export const PREF_KEY = 'ifs-pref'
