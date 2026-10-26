import { describe, expect, it } from 'vitest'
import { candidateFromAccount, mergeCandidates, visibleHandles } from './candidates'
import type { SimilarAccount } from './types'

function account(username: string, followers: number | null = null): SimilarAccount {
  return {
    id: username,
    username,
    fullName: '',
    verified: false,
    url: `https://www.instagram.com/${username}/`,
    followers,
    avatarUrl: null,
    isPrivate: false,
    category: null,
    biography: null,
  }
}

describe('candidates', () => {
  it('keeps the first source and fills a missing follower count', () => {
    const first = candidateFromAccount(account('ada'), 'suggested from root')
    const again = candidateFromAccount(account('Ada', 1200), 'following of root')
    const { all, added } = mergeCandidates([first], [again, candidateFromAccount(account('bob'), 'suggested from ada via root')])
    expect(added.map((item) => item.username)).toEqual(['bob'])
    expect(all.find((item) => item.username === 'ada')).toMatchObject({ source: 'suggested from root', followers: 1200 })
  })

  it('reads profile links from a following dialog and skips reserved paths', () => {
    expect(visibleHandles(['/ada/', '/explore/', '/bob', 'https://instagram.com/nope'], new Set(['explore']))).toEqual(['ada', 'bob'])
  })
})
