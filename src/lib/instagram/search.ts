export function accountSearchUrl(query: string): string {
  const url = new URL('https://www.instagram.com/api/v1/web/search/topsearch/')
  url.searchParams.set('search_surface', 'web_top_search')
  url.searchParams.set('context', 'blended')
  url.searchParams.set('include_reel', 'true')
  url.searchParams.set('query', query.trim())
  return url.toString()
}
