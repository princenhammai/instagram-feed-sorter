import { describe, expect, it } from 'vitest'
import { accountsFromHrefs, isKeywordSearchPage, keywordSearchUrl, mergeSearchAccounts } from './page-accounts'

describe('search page accounts', () => {
  it('reads profile links and skips the search page itself', () => {
    const names = accountsFromHrefs([
      'https://www.instagram.com/explore/search/keyword/?q=magician',
      'https://www.instagram.com/reel/AbC/',
      'https://www.instagram.com/magic.mike/',
      'https://www.instagram.com/magic.mike/reels/',
      'https://www.instagram.com/ada/',
    ])
    expect(names).toEqual(['magic.mike', 'ada'])
  })

  it('prefers a captured follower count and stops at the cap', () => {
    const merged = mergeSearchAccounts(
      [{ username: 'ada', followers: 1200 }, { username: '@bob', followers: null }],
      ['bob', 'cara', 'ada'],
      2,
    )
    expect(merged).toEqual([
      { username: 'ada', followers: 1200 },
      { username: 'bob', followers: null },
    ])
  })

  it('builds the keyword page the web app opens', () => {
    const url = new URL(keywordSearchUrl('nail art'))
    expect(url.pathname).toBe('/explore/search/keyword/')
    expect(url.searchParams.get('q')).toBe('nail art')
    expect(isKeywordSearchPage(url.toString(), 'Nail Art')).toBe(true)
    expect(isKeywordSearchPage('https://www.instagram.com/explore/search/keyword/?q=other', 'nail art')).toBe(false)
  })
})
