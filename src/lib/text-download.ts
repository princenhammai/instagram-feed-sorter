/** A self-contained URL the downloads API can read after the caller is gone. */
export function dataDownloadUrl(mime: string, text: string): string {
  const type = mime.split(';')[0]?.trim() || 'text/plain'
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return `data:${type};charset=utf-8;base64,${btoa(binary)}`
}

export function decodeDataDownloadUrl(url: string): string {
  const marker = ';base64,'
  const start = url.indexOf(marker)
  if (start < 0) throw new Error('Not a base64 data URL.')
  const binary = atob(url.slice(start + marker.length))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder().decode(bytes)
}

export interface TextDownloadRequest {
  filename: string
  mime: string
  text: string
}

export interface DownloadsClient {
  download(options: { url: string; filename: string; conflictAction: 'uniquify'; saveAs: boolean }): Promise<number | undefined>
}

/**
 * Save text with chrome.downloads.download. saveAs stays false so the file
 * goes to the default downloads folder. Success requires a numeric download id.
 */
export async function saveTextDownload(
  downloads: DownloadsClient,
  request: TextDownloadRequest,
): Promise<{ ok: true; downloadId: number } | { ok: false; error: string }> {
  if (!request.filename || typeof request.text !== 'string') return { ok: false, error: 'Could not name that export.' }
  try {
    const downloadId = await downloads.download({
      url: dataDownloadUrl(request.mime, request.text),
      filename: request.filename,
      conflictAction: 'uniquify',
      saveAs: false,
    })
    if (typeof downloadId !== 'number') return { ok: false, error: 'Chrome did not start the download.' }
    return { ok: true, downloadId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Export failed.' }
  }
}
