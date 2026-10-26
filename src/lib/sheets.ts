export async function sapisidToken(value: string, origin: string, now = Date.now()): Promise<string> {
  const timestamp = Math.floor(now / 1000)
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${timestamp} ${value} ${origin}`))
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${timestamp}_${hex}`
}

export function sheetUploadBody(title: string, csv: string, boundary: string): string {
  const name = title.toLowerCase().endsWith('.csv') ? title : `${title}.csv`
  const metadata = JSON.stringify({ title: name, mimeType: 'text/csv' })
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: text/csv; charset=UTF-8',
    '',
    csv.replace(/^\uFEFF/, ''),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

export function spreadsheetUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const file = payload as { id?: unknown }
  if (typeof file.id !== 'string' || !file.id) return null
  return `https://docs.google.com/spreadsheets/d/${file.id}/edit`
}

export function parseGoogleJson(text: string): unknown {
  return JSON.parse(text.replace(/^\)\]\}'\s*/, '')) as unknown
}
