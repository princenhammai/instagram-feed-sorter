import { describe, expect, it } from 'vitest'
import { samplePost } from './sample'
import { expansionUrls, followingRequest, mergeMemory, profileMemory, rememberProfile, similarRequest, type ProfileMemory, type ProfileStorage } from './profile-cache'
import { applyCandidates, applyScore, createSnowball, markExpanded, plan, type SnowballJob } from './snowball'
import type { Post } from './types'

const DAY = Date.UTC(2026, 9, 27, 12)

function strongPosts(username: string): Post[] {
  return [10_000, 10_000, 12_000, 40_000, 50_000].map((views, index) =>
    samplePost({
      id: `${username}-s${index}`,
      shortcode: `${username}-s${index}`,
      username,
      views,
      likes: Math.round(views * 0.04),
      comments: 2,
      url: `https://www.instagram.com/reel/${username}-s${index}/`,
    }),
  )
}

function memoryStore(): ProfileStorage & { snapshot(): Record<string, ProfileMemory> } {
  const bag = new Map<string, string>()
  return {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => {
      bag.set(key, value)
    },
    snapshot: () => {
      const raw = bag.values().next().value
      return raw ? (JSON.parse(raw) as Record<string, ProfileMemory>) : {}
    },
  }
}

describe('snowball network', () => {
  it('makes zero web_profile_info calls across a full run, including expansion after the tab moves on', () => {
    const storage = memoryStore()
    const savedWhileOpen: Record<string, ProfileMemory> = {
      abeparker: { id: '173560420', followers: 120_000, suggested: [{ username: 'nextmagician', followers: 20_000 }] },
      omgadrian: { followers: 80_000, suggested: [] },
    }
    let job: SnowballJob = createSnowball(['abeparker', 'omgadrian'], { maxDepth: 1, targetStrong: 5, minStrongRatio: 0, dailyCap: 25 }, DAY)
    let viewing = ''
    const urls: string[] = []
    let expandedAbeAfterLeaving = false

    for (let guard = 0; guard < 40 && job.status === 'running'; guard += 1) {
      const planned = plan(job, DAY)
      job = planned.job
      if (planned.step.type === 'score' && planned.step.username) {
        const username = planned.step.username
        viewing = username
        const captured = savedWhileOpen[username] ?? { followers: null, suggested: [] }
        rememberProfile(storage, username, captured)
        job = applyScore(job, { username, followers: captured.followers, posts: strongPosts(username) }, DAY)
        continue
      }
      if (planned.step.type === 'expand' && planned.step.username) {
        const username = planned.step.username
        const memory = profileMemory(storage, username)
        const requested = expansionUrls(memory)
        urls.push(...requested)
        if (username === 'abeparker') {
          expandedAbeAfterLeaving = viewing !== 'abeparker'
          expect(memory?.id).toBe('173560420')
          expect(similarRequest(memory)).toBeNull()
          expect(followingRequest(memory)).toContain('/api/v1/friendships/173560420/following/')
        }
        if (username === 'omgadrian') {
          expect(memory?.id).toBeUndefined()
          expect(requested).toEqual([])
        }
        const incoming = (memory?.suggested ?? []).map((account) => ({
          username: account.username,
          followers: account.followers,
          via: 'suggested' as const,
        }))
        job = markExpanded(applyCandidates(job, username, incoming, DAY), username, DAY)
        continue
      }
      break
    }

    expect(job.status).toBe('done')
    expect(expandedAbeAfterLeaving).toBe(true)
    expect(job.expanded.map((name) => name.toLowerCase())).toEqual(expect.arrayContaining(['abeparker', 'omgadrian']))
    expect(job.accounts.some((account) => account.username === 'nextmagician')).toBe(true)
    expect(urls.some((url) => url.includes('web_profile_info'))).toBe(false)
    expect(urls).toEqual(['https://www.instagram.com/api/v1/friendships/173560420/following/?count=12'])

    const missingId = mergeMemory(undefined, { followers: 10, suggested: [] })
    expect(expansionUrls(missingId)).toEqual([])
    expect(expansionUrls(undefined).join('')).not.toContain('web_profile_info')
  })
})
