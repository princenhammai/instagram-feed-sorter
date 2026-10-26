import { describe, expect, it, vi } from 'vitest'
import { offscreenDocumentExists } from './offscreen'

const url = 'chrome-extension://example/offscreen.html'

describe('offscreen detection across Chrome versions', () => {
  it('uses the native check when available', async () => {
    const contextUrls = vi.fn()
    expect(await offscreenDocumentExists({ url, hasDocument: async () => true, contextUrls })).toBe(true)
    expect(contextUrls).not.toHaveBeenCalled()
  })

  it('uses extension contexts when the native check is unavailable', async () => {
    expect(await offscreenDocumentExists({ url, contextUrls: async () => [undefined, url] })).toBe(true)
    expect(await offscreenDocumentExists({ url, contextUrls: async () => ['chrome-extension://example/popup.html'] })).toBe(false)
  })

  it('supports older service workers without confusing other pages for the offscreen page', async () => {
    expect(await offscreenDocumentExists({ url, clientUrls: async () => [url] })).toBe(true)
    expect(await offscreenDocumentExists({ url, clientUrls: async () => ['https://www.instagram.com/', 'chrome-extension://example/src/options/index.html'] })).toBe(false)
  })

  it('allows creation when no inspection API is available', async () => {
    expect(await offscreenDocumentExists({ url })).toBe(false)
  })
})
