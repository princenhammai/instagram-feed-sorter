import { SAFETY_CAP } from '../types'
import type { Post } from '../types'

export interface PageBatch {
  posts: Post[]
  nextMaxId?: string
}

export interface CollectRequest {
  load: (maxId: string | undefined, signal: AbortSignal) => Promise<PageBatch>
  limit: number
  start?: number
  end?: number
  signal: AbortSignal
  delayMs?: number
  onProgress?: (count: number) => void
}

export interface CollectResult {
  posts: Post[]
  capped: boolean
  stopped: boolean
  interrupted?: string
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function collectPosts(request: CollectRequest): Promise<CollectResult> {
  const posts: Post[] = []
  const seen = new Set<string>()
  let maxId: string | undefined
  const delay = request.delayMs ?? 900

  for (let page = 0; page < 250; page += 1) {
    if (request.signal.aborted) return { posts, capped: false, stopped: true }
    let batch: PageBatch
    try {
      batch = await request.load(maxId, request.signal)
    } catch (error) {
      if (request.signal.aborted) return { posts, capped: false, stopped: true }
      if (posts.length === 0) throw error
      const reason = error instanceof Error ? error.message : 'Instagram stopped answering.'
      return { posts, capped: false, stopped: false, interrupted: reason }
    }

    let passedStart = false
    for (let index = 0; index < batch.posts.length; index += 1) {
      const post = batch.posts[index]
      if (seen.has(post.id)) continue
      const dated = request.start != null || request.end != null
      if (dated) {
        if (!post.takenAt) continue
        if (request.end != null && post.takenAt > request.end) continue
        if (request.start != null && post.takenAt < request.start) {
          passedStart = true
          continue
        }
      }
      seen.add(post.id)
      posts.push(post)
      if (posts.length >= request.limit) {
        const moreRemain = index < batch.posts.length - 1 || Boolean(batch.nextMaxId)
        request.onProgress?.(posts.length)
        return {
          posts,
          capped: request.limit >= SAFETY_CAP && moreRemain,
          stopped: false,
        }
      }
    }

    request.onProgress?.(posts.length)
    if (passedStart) return { posts, capped: false, stopped: false }
    if (!batch.nextMaxId || batch.nextMaxId === maxId) return { posts, capped: false, stopped: false }
    maxId = batch.nextMaxId
    try {
      await sleep(delay, request.signal)
    } catch {
      return { posts, capped: false, stopped: true }
    }
  }

  return { posts, capped: posts.length >= SAFETY_CAP, stopped: false }
}
