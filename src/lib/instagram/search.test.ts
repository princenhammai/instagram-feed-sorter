import { describe, expect, it } from 'vitest'
import { accountSearchUrl } from './search'

describe('account search url', () => {
  it('uses the signed-in web search call and names the surface', () => {
    const url = new URL(accountSearchUrl('barber'))
    expect(url.origin).toBe('https://www.instagram.com')
    expect(url.pathname).toBe('/api/v1/web/search/topsearch/')
    expect(url.searchParams.get('search_surface')).toBe('web_top_search')
    expect(url.searchParams.get('context')).toBe('blended')
    expect(url.searchParams.get('query')).toBe('barber')
  })
})
