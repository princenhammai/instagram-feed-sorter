import { useSyncExternalStore } from 'react'
import { DEFAULT_SETTINGS, type Post, type RangeChoice, type Settings, type SimilarAccount, type SortKey, type SortableSurface } from '../lib/types'

export interface ReadyModel {
  surface: SortableSurface
  posts: Post[]
  sortKey: SortKey
  range: RangeChoice
  capped: boolean
  warning: string | null
}

export type Phase =
  | { type: 'idle' }
  | { type: 'collecting'; collected: number; label: string; percent: number | null; scrolling: boolean }
  | { type: 'ready'; runId: number; model: ReadyModel }
  | { type: 'error'; message: string }

export interface DownloadState {
  done: number
  total: number
  label: string
}

export interface SimilarState {
  open: boolean
  loading: boolean
  accounts: SimilarAccount[]
  error: string | null
}

export interface BatchProgress {
  index: number
  total: number
  handle: string
  collected: number
  limit: number
  label: string
}

export interface Snap {
  href: string
  phase: Phase
  download: DownloadState | null
  similar: SimilarState
  notice: string | null
  settings: Settings
  batch: BatchProgress | null
  researchOpen: boolean
}

export const CLOSED_SIMILAR: SimilarState = { open: false, loading: false, accounts: [], error: null }

let snap: Snap = {
  href: typeof location === 'undefined' ? '' : location.href,
  phase: { type: 'idle' },
  download: null,
  similar: CLOSED_SIMILAR,
  notice: null,
  settings: DEFAULT_SETTINGS,
  batch: null,
  researchOpen: false,
}

const listeners = new Set<() => void>()
let noticeTimer = 0

export function getSnap(): Snap {
  return snap
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function patch(partial: Partial<Snap>): void {
  snap = { ...snap, ...partial }
  listeners.forEach((listener) => listener())
}

export function notify(message: string): void {
  patch({ notice: message })
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    if (getSnap().notice === message) patch({ notice: null })
  }, 4200)
}

export function useSnap(): Snap {
  return useSyncExternalStore(subscribe, getSnap, getSnap)
}
