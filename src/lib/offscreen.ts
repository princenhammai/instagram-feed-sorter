export interface OffscreenProbe {
  url: string
  hasDocument?: () => Promise<boolean>
  contextUrls?: () => Promise<(string | undefined)[]>
  clientUrls?: () => Promise<string[]>
}

// Chrome versions expose different ways to inspect an existing offscreen page.
export async function offscreenDocumentExists(probe: OffscreenProbe): Promise<boolean> {
  if (probe.hasDocument) return probe.hasDocument()
  if (probe.contextUrls) return (await probe.contextUrls()).includes(probe.url)
  if (probe.clientUrls) return (await probe.clientUrls()).includes(probe.url)
  return false
}
