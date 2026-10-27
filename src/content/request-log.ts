import { useSyncExternalStore } from 'react'
import { formatRequestLine } from '../lib/instagram/page-data'

export const REQUEST_LOG_KEY = 'ifs-request-log'

export interface RequestTrace {
  url: string
  status: number
  snippet: string
}

let traces: RequestTrace[] = []
let lines: string[] = []
const listeners = new Set<() => void>()

function publish(): void {
  lines = traces.map((trace) => formatRequestLine(trace.status, trace.url, trace.snippet))
  listeners.forEach((listener) => listener())
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    void chrome.storage.local.set({ [REQUEST_LOG_KEY]: traces })
  }
}

export function recordTrace(trace: RequestTrace): void {
  if (!trace.url && !trace.snippet) return
  traces = [trace, ...traces].slice(0, 12)
  publish()
}

export function hydrateTraces(stored: unknown): void {
  if (!Array.isArray(stored)) return
  const next = stored.filter(
    (item): item is RequestTrace =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as RequestTrace).url === 'string' &&
      typeof (item as RequestTrace).status === 'number' &&
      typeof (item as RequestTrace).snippet === 'string',
  )
  traces = next.slice(0, 12)
  publish()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRequestLog(): string[] {
  return useSyncExternalStore(subscribe, () => lines, () => lines)
}
