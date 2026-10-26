/** "1,234 followers", "1.2M followers", and "12K followers". */
export function parseFollowerCount(text: string): number | null {
  const match = text.match(/([\d][\d,]*(?:\.\d+)?)\s*([KMB])?\s+followers\b/i)
  if (!match) return null
  const digits = match[1].replace(/,/g, '')
  const unit = (match[2] || '').toUpperCase()
  const scale = unit === 'B' ? 1_000_000_000 : unit === 'M' ? 1_000_000 : unit === 'K' ? 1_000 : 1
  const value = Number(digits) * scale
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

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
  readonly url: string
  readonly snippet: string

  constructor(
    message: string,
    readonly status: number,
    url = '',
    snippet = '',
  ) {
    super(message)
    this.name = 'HttpError'
    this.url = url
    this.snippet = snippet
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

export function hasFeedbackRequired(body: string): boolean {
  if (!body || !/feedback_required/i.test(body)) return false
  try {
    const parsed = JSON.parse(body) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    const record = parsed as Record<string, unknown>
    if (record.feedback_required === true) return true
    return ['message', 'feedback_title', 'feedback_message'].some(
      (key) => typeof record[key] === 'string' && /feedback_required/i.test(record[key]),
    )
  } catch {
    return /"message"\s*:\s*"feedback_required"/i.test(body) || /"feedback_required"\s*:\s*true/i.test(body)
  }
}

export function httpFailureMessage(status: number, body: string): string {
  const snippet = responseSnippet(body)
  const head = `HTTP ${status} from Instagram.`
  const extra = hasFeedbackRequired(body) && !/feedback_required/i.test(snippet) ? 'feedback_required' : ''
  return [head, snippet, extra].filter(Boolean).join(' ')
}

export function formatRequestLine(status: number, url: string, snippet = ''): string {
  let path = url
  try {
    const parsed = new URL(url)
    path = `${parsed.pathname}${parsed.search}`
  } catch {
    path = url
  }
  const text = snippet.trim()
  if (!text || text === 'ok') return `HTTP ${status} ${path}`
  return `HTTP ${status} ${path} — ${text}`
}
