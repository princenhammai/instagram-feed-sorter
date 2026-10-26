function bytesFromBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'saver') return false
  if (message.type === 'PING') {
    sendResponse({ ok: true })
    return false
  }
  if (message.type !== 'SAVE' || typeof message.base64 !== 'string' || typeof message.filename !== 'string') {
    sendResponse({ ok: false, error: 'The export was missing its file.' })
    return false
  }
  let bytes
  try {
    bytes = bytesFromBase64(message.base64)
  } catch {
    sendResponse({ ok: false, error: 'The export file was not valid.' })
    return false
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: message.mime || 'application/octet-stream' }))
  chrome.downloads.download({ url, filename: message.filename, conflictAction: 'uniquify', saveAs: false }).then(
    (id) => {
      setTimeout(() => URL.revokeObjectURL(url), 120000)
      sendResponse({ ok: true, id })
    },
    (error) => {
      URL.revokeObjectURL(url)
      sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Chrome did not start the export.' })
    },
  )
  return true
})
