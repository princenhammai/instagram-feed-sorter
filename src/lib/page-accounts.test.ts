import { describe, expect, it } from 'vitest'
import { extractSearchUsers } from './instagram/extract'
import {
  accountsFromHrefs,
  accountsFromSearchHits,
  isKeywordSearchPage,
  keywordSearchUrl,
  mergeSearchAccounts,
  requestMatchesKeyword,
  searchCaptureNote,
  visibleSearchAccounts,
} from './page-accounts'

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

  it('keeps result-column accounts and drops a sidebar account that is not a result', () => {
    const names = visibleSearchAccounts(
      ['https://www.instagram.com/magic.mike/', 'https://www.instagram.com/alangenter.hair/'],
      ['https://www.instagram.com/alangenter.hair/'],
      15,
    )
    expect(names).toEqual(['magic.mike'])
  })

  it('does not add a captured sidebar account that is missing from the result column', () => {
    const fromDom = accountsFromSearchHits(
      ['magic.mike'],
      [
        { username: 'magic.mike', followers: 10 },
        { username: 'alangenter.hair', followers: 20 },
      ],
      [],
      15,
    )
    expect(fromDom).toEqual([{ username: 'magic.mike', followers: 10 }])
    const fromNetwork = accountsFromSearchHits(
      [],
      [
        { username: 'magic.mike', followers: 10 },
        { username: 'alangenter.hair', followers: 20 },
      ],
      ['alangenter.hair'],
      15,
    )
    expect(fromNetwork).toEqual([{ username: 'magic.mike', followers: 10 }])
  })

  it('tags only the keyword search request and lists those handles', () => {
    const page = 'https://www.instagram.com/explore/search/keyword/?q=magician'
    expect(requestMatchesKeyword(page, 'https://www.instagram.com/graphql/query', 'variables={"q":"magician"}')).toBe(true)
    expect(requestMatchesKeyword(page, 'https://www.instagram.com/api/v1/feed/user/1/', '')).toBe(false)
    expect(requestMatchesKeyword('https://www.instagram.com/abeparker/reels/', 'https://www.instagram.com/graphql/query', 'magician')).toBe(false)
    const note = searchCaptureNote('magician', ['magic.mike', 'ada'])
    expect(note.status).toBe(200)
    expect(note.snippet).toBe('2 accounts: @magic.mike, @ada')
    expect(note.note).toBe('magician: @magic.mike, @ada')
  })

  it('reads search-result users and skips suggested accounts in the same payload', () => {
    const found = extractSearchUsers({
      users: [{ username: 'magic.mike', pk: '1' }],
      suggested_users: [{ username: 'alangenter.hair', pk: '2' }],
      edge_chaining: { edges: [{ node: { username: 'barber', pk: '3' } }] },
    })
    expect(found.map((account) => account.username)).toEqual(['magic.mike'])
  })
})
