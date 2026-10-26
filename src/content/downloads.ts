import type { RemoteFile } from '../lib/media-files'

interface WritableFile {
  write(data: Blob | BufferSource): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}

interface FileHandle {
  createWritable(): Promise<WritableFile>
}

export interface DirectoryHandle {
  name: string
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>
}

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<DirectoryHandle>
}

export function canPickFolder(): boolean {
  return typeof (window as PickerWindow).showDirectoryPicker === 'function'
}

export type PickResult = { type: 'picked'; dir: DirectoryHandle } | { type: 'cancelled' } | { type: 'unavailable' }

export async function pickFolder(): Promise<PickResult> {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (typeof picker !== 'function') return { type: 'unavailable' }
  try {
    return { type: 'picked', dir: await picker.call(window, { id: 'ifs-downloads', mode: 'readwrite', startIn: 'downloads' }) }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { type: 'cancelled' }
    return { type: 'unavailable' }
  }
}

async function fileIn(root: DirectoryHandle, path: string): Promise<FileHandle> {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop() || 'file'
  let dir = root
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true })
  return dir.getFileHandle(name, { create: true })
}

export interface FolderDownloadResult {
  saved: number
  failed: RemoteFile[]
  stopped: boolean
}

export async function downloadToFolder(
  root: DirectoryHandle,
  subfolder: string,
  files: RemoteFile[],
  signal: AbortSignal,
  onProgress: (done: number, total: number, bytes: number) => void,
): Promise<FolderDownloadResult> {
  const target = subfolder ? await root.getDirectoryHandle(subfolder, { create: true }) : root
  const failed: RemoteFile[] = []
  let saved = 0
  let bytes = 0
  for (let index = 0; index < files.length; index += 1) {
    if (signal.aborted) return { saved, failed, stopped: true }
    const file = files[index]
    try {
      const response = await fetch(file.url, { credentials: 'omit', signal })
      if (!response.ok || !response.body) throw new Error(String(response.status))
      const handle = await fileIn(target, file.name)
      const writable = await handle.createWritable()
      const reader = response.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          await writable.write(value)
          bytes += value.byteLength
        }
        await writable.close()
        saved += 1
      } catch (error) {
        await writable.abort().catch(() => undefined)
        throw error
      }
    } catch {
      if (signal.aborted) return { saved, failed, stopped: true }
      failed.push(file)
    }
    onProgress(index + 1, files.length, bytes)
  }
  return { saved, failed, stopped: false }
}
