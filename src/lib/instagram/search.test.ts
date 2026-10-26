import { describe, expect, it } from 'vitest'
import { accountSearchUrl, accountsInSearch, hashtagUrl, reelsSearchUrl, topSerpUrl, userSearchUrl } from './search'

describe('account search url', () => {
  it('uses the signed-in web search call and names the surface', () => {
    const url = new URL(accountSearchUrl('barber'))
    expect(url.origin).toBe('https://www.instagram.com')
    expect(url.pathname).toBe('/api/v1/web/search/topsearch/')
    expect(url.searchParams.get('search_surface')).toBe('web_top_search')
    expect(url.searchParams.get('context')).toBe('blended')
    expect(url.searchParams.get('query')).toBe('barber')
  })

  it('points keyword search at the accounts tab, Reels, and a hashtag', () => {
    expect(new URL(userSearchUrl('nail art')).searchParams.get('context')).toBe('user')
    expect(new URL(reelsSearchUrl('nail art')).pathname).toBe('/api/v1/fbsearch/reels_serp/')
    expect(new URL(topSerpUrl('nail art')).pathname).toBe('/api/v1/fbsearch/web/top_serp/')
    expect(hashtagUrl('#Barber_Shop')).toContain('tag_name=Barber_Shop')
    expect(hashtagUrl('nail art')).toBeNull()
  })

  it('reads accounts from the accounts tab and owners from Reel results', () => {
    const accounts = accountsInSearch({
      users: [{ position: 0, user: { pk: '4', username: 'barber.studio', follower_count: 900 } }],
    })
    const owners = accountsInSearch({
      items: [{ media: { pk: '9', code: 'AbC', media_type: 2, user: { username: 'clip.owner' } } }],
    })
    expect(accounts.map((account) => account.username)).toEqual(['barber.studio'])
    expect(accounts[0]?.followers).toBe(900)
    expect(owners.map((account) => account.username)).toEqual(['clip.owner'])
  })
})
