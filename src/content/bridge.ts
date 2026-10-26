import { HttpError } from '../lib/instagram/page-data'
import { ISO_SOURCE, MAIN_SOURCE, type MainCall } from '../lib/protocol'

const NONCE_ATTR = 'data-ifs-nonce'

let nonce = ''
let sequence = 0
let mainReady: Promise<void> | null = null

function ensureMain(): Promise<void> {
  if (!mainReady) {
    mainReady = chrome.runtime
      .sendMessage({ type: 'ENSURE_MAIN' })
      .then((response: { ok?: boolean; error?: string }) => {
        if (!response?.ok) throw new Error(response?.error || 'Could not reach Instagram from this tab.')
      })
      .catch((error: unknown) => {
        mainReady = null
        throw error
      })
  }
  return mainReady
}

function ensureNonce(): string {
  if (!nonce) nonce = crypto.randomUUID()
  document.documentElement.setAttribute(NONCE_ATTR, nonce)
  return nonce
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const pending = new Map<string, Pending>()

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data as {
    source?: string
    nonce?: string
    id?: string
    payload?: unknown
    error?: string
    status?: number
  }
  if (!data || data.source !== MAIN_SOURCE || data.nonce !== nonce || !data.id) return
  const job = pending.get(data.id)
  if (!job) return
  pending.delete(data.id)
  if (data.error) job.reject(new HttpError(data.error, typeof data.status === 'number' ? data.status : 0))
  else job.resolve(data.payload)
})

export function callMain(call: MainCall, timeoutMs = 60000): Promise<unknown> {
  return ensureMain().then(
    () =>
      new Promise((resolve, reject) => {
        const id = String(++sequence)
        const current = ensureNonce()
        const timer = window.setTimeout(() => {
          pending.delete(id)
          reject(new Error('Instagram took too long to answer. Refresh the page and try again.'))
        }, timeoutMs)
        pending.set(id, {
          resolve: (value) => {
            window.clearTimeout(timer)
            resolve(value)
          },
          reject: (error) => {
            window.clearTimeout(timer)
            reject(error)
          },
        })
        window.postMessage({ source: ISO_SOURCE, nonce: current, id, ...call }, window.location.origin)
      }),
  )
}
