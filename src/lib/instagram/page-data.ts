export function findUserIdInText(text: string, username: string): string | undefined {
  const name = username.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const marker = new RegExp(`"username"\\s*:\\s*"${name}"`, 'gi')
  const idPattern = /"(?:pk|pk_id|id|user_id|profile_id)"\s*:\s*"?(\d{3,20})"?/g
  let match: RegExpExecArray | null
  while ((match = marker.exec(text))) {
    const windowStart = Math.max(0, match.index - 600)
    const windowText = text.slice(windowStart, match.index + 600)
    const center = match.index - windowStart
    let best: { id: string; distance: number } | undefined
    let idMatch: RegExpExecArray | null
    idPattern.lastIndex = 0
    while ((idMatch = idPattern.exec(windowText))) {
      const distance = Math.abs(idMatch.index - center)
      if (!best || distance < best.distance) best = { id: idMatch[1], distance }
    }
    if (best) return best.id
  }
  return undefined
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function isRateLimit(error: unknown): boolean {
  return error instanceof HttpError && error.status === 429
}

export function responseSnippet(body: string, limit = 180): string {
  const trimmed = body.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('<') || /^<!doctype html/i.test(trimmed)) return 'Instagram returned HTML instead of JSON.'
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      const bits = ['feedback_message', 'message', 'feedback_title']
        .map((key) => record[key])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
      if (bits.length > 0) return bits.join(' ').replace(/\s+/g, ' ').slice(0, limit)
    }
  } catch {
    // A non-JSON body is quoted as text below.
  }
  return trimmed.replace(/\s+/g, ' ').slice(0, limit)
}

export function httpFailureMessage(status: number, body: string): string {
  const snippet = responseSnippet(body)
  const head = `HTTP ${status} from Instagram.`
  return snippet ? `${head} ${snippet}` : head
}
