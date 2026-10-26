import JSZip from 'jszip'
import { isAllowedMediaUrl } from '../lib/media-files'

let cancel = false

function downloadBlob(blob: Blob, filename: string, saveAs = false): Promise<void> {
  const url = URL.createObjectURL(blob)
  return chrome.downloads
    .download({ url, filename, conflictAction: 'uniquify', saveAs })
    .then(() => {
      setTimeout(() => URL.revokeObjectURL(url), 120_000)
    })
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function saveFile(message: {
  filename: string
  mime: string
  text?: string
  base64?: string
  saveAs?: boolean
}): Promise<{ ok: boolean }> {
  const blob =
    typeof message.base64 === 'string'
      ? new Blob([decodeBase64(message.base64)], { type: message.mime })
      : new Blob([message.text ?? ''], { type: message.mime })
  await downloadBlob(blob, message.filename, message.saveAs)
  return { ok: true }
}

async function saveZip(message: {
  filename: string
  entries: { name: string; url: string }[]
}): Promise<{ ok: boolean; error?: string; saved?: number; failed?: number; stopped?: boolean }> {
  cancel = false
  const zip = new JSZip()
  let failed = 0
  let done = 0
  for (const entry of message.entries) {
    if (cancel) break
    try {
      if (!isAllowedMediaUrl(entry.url)) throw new Error('rejected')
      const response = await fetch(entry.url, { credentials: 'omit' })
      if (!response.ok) throw new Error(String(response.status))
      zip.file(entry.name, await response.arrayBuffer())
    } catch {
      failed += 1
    }
    done += 1
    void chrome.runtime.sendMessage({
      target: 'background',
      type: 'PROGRESS',
      done,
      total: message.entries.length,
    })
  }
  const saved = Object.values(zip.files).filter((file) => !file.dir).length
  if (saved === 0) {
    return { ok: false, error: cancel ? 'Download stopped before any file was saved.' : 'None of the files could be saved.', failed, stopped: cancel }
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  await downloadBlob(blob, message.filename, true)
  return { ok: true, saved, failed, stopped: cancel }
}

setInterval(() => {
  void chrome.runtime.sendMessage({ target: 'background', type: 'BRIDGE_PING' }).catch(() => undefined)
}, 10_000)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false
  if (message.type === 'PING') {
    sendResponse({ ok: true })
    return false
  }
  if (message.type === 'CANCEL') {
    cancel = true
    sendResponse({ ok: true })
    return false
  }
  if (message.type === 'FILE') {
    saveFile(message)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Export failed.' }))
    return true
  }
  if (message.type === 'ZIP') {
    saveZip(message)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Download failed.' }))
    return true
  }
  return false
})
