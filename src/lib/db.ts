import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Post } from './types'

export interface Folder {
  id: string
  name: string
  createdAt: number
}

export interface SavedSlide {
  kind: 'image' | 'video'
  blob: Blob
}

export interface SavedPost {
  id: string
  folderId: string
  savedAt: number
  post: Post
  cover?: Blob
  video?: Blob
  slides: SavedSlide[]
  mediaWarning?: string
}

interface LibrarySchema extends DBSchema {
  folders: { key: string; value: Folder }
  posts: { key: string; value: SavedPost; indexes: { byFolder: string } }
}

const INBOX = 'inbox'

let database: Promise<IDBPDatabase<LibrarySchema>> | null = null

export function libraryDb(): Promise<IDBPDatabase<LibrarySchema>> {
  if (!database) {
    database = openDB<LibrarySchema>('ifs-library', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('posts')) {
          const store = db.createObjectStore('posts', { keyPath: 'id' })
          store.createIndex('byFolder', 'folderId')
        }
      },
    })
  }
  return database
}

export async function ensureInbox(): Promise<void> {
  const db = await libraryDb()
  const inbox = await db.get('folders', INBOX)
  if (!inbox) await db.put('folders', { id: INBOX, name: 'Inbox', createdAt: Date.now() })
}

export async function listFolders(): Promise<Folder[]> {
  await ensureInbox()
  const db = await libraryDb()
  const folders = await db.getAll('folders')
  return folders.sort((a, b) => (a.id === INBOX ? -1 : b.id === INBOX ? 1 : a.name.localeCompare(b.name)))
}

export async function listPosts(folderId?: string): Promise<SavedPost[]> {
  const db = await libraryDb()
  const posts = folderId ? await db.getAllFromIndex('posts', 'byFolder', folderId) : await db.getAll('posts')
  return posts.sort((a, b) => b.savedAt - a.savedAt)
}

export async function createFolder(name: string): Promise<Folder> {
  const folder: Folder = { id: crypto.randomUUID(), name: name.trim() || 'Folder', createdAt: Date.now() }
  const db = await libraryDb()
  await db.put('folders', folder)
  return folder
}

export async function renameFolder(id: string, name: string): Promise<void> {
  if (id === INBOX) throw new Error('Inbox keeps its name.')
  const db = await libraryDb()
  const folder = await db.get('folders', id)
  if (!folder) throw new Error('That folder is gone.')
  await db.put('folders', { ...folder, name: name.trim() || folder.name })
}

export async function deleteFolder(id: string): Promise<void> {
  if (id === INBOX) throw new Error('Inbox stays.')
  const db = await libraryDb()
  const posts = await db.getAllFromIndex('posts', 'byFolder', id)
  const tx = db.transaction(['folders', 'posts'], 'readwrite')
  await Promise.all([
    ...posts.map((post) => tx.objectStore('posts').delete(post.id)),
    tx.objectStore('folders').delete(id),
    tx.done,
  ])
}

export async function putSaved(post: SavedPost): Promise<void> {
  await ensureInbox()
  const db = await libraryDb()
  await db.put('posts', post)
}

export async function deleteSaved(id: string): Promise<void> {
  const db = await libraryDb()
  await db.delete('posts', id)
}

export async function moveSaved(id: string, folderId: string): Promise<void> {
  const db = await libraryDb()
  const post = await db.get('posts', id)
  if (!post) return
  await db.put('posts', { ...post, folderId })
}

export const INBOX_ID = INBOX
