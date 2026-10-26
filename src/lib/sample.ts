import type { Post } from './types'

export function samplePost(overrides: Partial<Post> = {}): Post {
  return {
    id: overrides.id ?? '1',
    shortcode: overrides.shortcode ?? 'abc',
    username: overrides.username ?? 'creator',
    url: overrides.url ?? 'https://www.instagram.com/p/abc/',
    caption: overrides.caption ?? 'hello',
    takenAt: overrides.takenAt ?? Date.UTC(2024, 0, 2),
    likes: overrides.likes === undefined ? 10 : overrides.likes,
    comments: overrides.comments === undefined ? 2 : overrides.comments,
    views: overrides.views === undefined ? 100 : overrides.views,
    mediaKind: overrides.mediaKind ?? 'video',
    coverUrl: overrides.coverUrl === undefined ? 'https://scontent.cdninstagram.com/cover.jpg' : overrides.coverUrl,
    videoUrl: overrides.videoUrl === undefined ? 'https://scontent.cdninstagram.com/video.mp4' : overrides.videoUrl,
    slides: overrides.slides ?? [],
    duration: overrides.duration,
    outlierScore: overrides.outlierScore,
    engagementRate: overrides.engagementRate,
  }
}
