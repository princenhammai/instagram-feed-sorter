import { useEffect, useState } from 'react'
import JSZip from 'jszip'
import {
  INBOX_ID,
  createFolder,
  deleteFolder,
  deleteSaved,
  listFolders,
  listPosts,
  moveSaved,
  renameFolder,
  type Folder,
  type SavedPost,
} from '../lib/db'
import { exportColumns, toCsv } from '../lib/export'
import { confirmChromeDownload, describeSavedFile } from '../lib/file-download'
import { downloadName, postFileBase, safeSegment } from '../lib/media-files'
import { withResearch } from '../lib/research'
import { formatCount, formatDay } from '../lib/format'

export function Library() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderId, setFolderId] = useState(INBOX_ID)
  const [posts, setPosts] = useState<SavedPost[]>([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')

  async function reload(nextFolder = folderId) {
    const [nextFolders, nextPosts] = await Promise.all([listFolders(), listPosts(nextFolder)])
    setFolders(nextFolders)
    setPosts(nextPosts)
    setFolderId(nextFolder)
  }

  useEffect(() => {
    void reload(INBOX_ID)
  }, [])

  const folder = folders.find((item) => item.id === folderId)

  return (
    <section className="library">
      <h2>Library</h2>
      <p className="meta">Saved Instagram posts stay on this computer. Remote links expire, so the file itself is kept when Instagram allows it.</p>
      {message && <p>{message}</p>}
      <div className="layout">
        <aside className="folders">
          {folders.map((item) => (
            <button key={item.id} type="button" aria-current={item.id === folderId} onClick={() => void reload(item.id)}>
              {item.name}
            </button>
          ))}
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault()
              void createFolder(name).then((created) => {
                setName('')
                return reload(created.id)
              })
            }}
          >
            <input value={name} placeholder="New folder" onChange={(event) => setName(event.target.value)} />
            <button type="submit">Add</button>
          </form>
          {folder && folder.id !== INBOX_ID && (
            <div className="row">
              <button
                type="button"
                onClick={() => {
                  const next = window.prompt('Folder name', folder.name)
                  if (!next) return
                  void renameFolder(folder.id, next).then(() => reload(folder.id))
                }}
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Delete ${folder.name} and the posts inside it?`)) return
                  void deleteFolder(folder.id)
                    .then(() => reload(INBOX_ID))
                    .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Could not delete that folder.'))
                }}
              >
                Delete
              </button>
            </div>
          )}
        </aside>
        <section className="posts">
          <div className="row">
            <h2>{folder?.name ?? 'Folder'}</h2>
            <button
              type="button"
              disabled={posts.length === 0}
              onClick={() => void exportCsv(posts, folder?.name || 'library', setMessage)}
            >
              Export CSV
            </button>
            <button type="button" disabled={posts.length === 0} onClick={() => void exportZip(posts, folder?.name || 'library').then((note) => setMessage(note)).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Chrome did not save the zip.'))}>
              Download files
            </button>
          </div>
          {posts.length === 0 && <p className="meta">Nothing saved in this folder yet. Use Save on a post while you browse Instagram.</p>}
          {posts.map((saved) => (
            <article key={saved.id} className="post">
              <Media saved={saved} />
              <div>
                <strong>@{saved.post.username || 'instagram'}</strong>
                <p className="meta">
                  {formatDay(saved.post.takenAt)} · {formatCount(saved.post.views)} views · {formatCount(saved.post.likes)} likes ·{' '}
                  {formatCount(saved.post.comments)} comments
                </p>
                <p className="caption">{saved.post.caption}</p>
                {saved.mediaWarning && <p className="meta">{saved.mediaWarning}</p>}
                <div className="row">
                  <a href={saved.post.url} target="_blank" rel="noreferrer">Open on Instagram</a>
                  <select value={saved.folderId} onChange={(event) => void moveSaved(saved.id, event.target.value).then(() => reload())}>
                    {folders.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void deleteSaved(saved.id).then(() => reload())}>Remove</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </section>
  )
}

function Media({ saved }: { saved: SavedPost }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const blob = saved.video || saved.cover || saved.slides[0]?.blob
    if (!blob) return
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [saved])
  if (!url) return <div className="meta">No file stored</div>
  return saved.video || saved.slides[0]?.kind === 'video' ? <video src={url} controls /> : <img src={url} alt="" />
}

async function exportCsv(posts: SavedPost[], folderName: string, setMessage: (message: string) => void): Promise<void> {
  setMessage('Saving CSV…')
  const response = (await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_TEXT',
    filename: downloadName(`${safeSegment(folderName)}.csv`),
    mime: 'text/csv;charset=utf-8',
    text: toCsv(exportColumns(), withResearch(posts.map((item) => item.post))),
  })) as { ok?: boolean; error?: string; filename?: string } | undefined
  setMessage(response?.ok ? `Saved CSV to ${describeSavedFile(response.filename)}.` : response?.error || 'Chrome did not save the CSV.')
}

async function exportZip(posts: SavedPost[], folderName: string): Promise<string> {
  const zip = new JSZip()
  for (const saved of posts) {
    const base = postFileBase(saved.post)
    if (saved.video) zip.file(`${base}.mp4`, saved.video)
    if (saved.cover) zip.file(`${base}.jpg`, saved.cover)
    saved.slides.forEach((slide, index) => {
      zip.file(`${base}/${base}-${index + 1}.${slide.kind === 'video' ? 'mp4' : 'jpg'}`, slide.blob)
    })
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  try {
    const id = await chrome.downloads.download({
      url,
      filename: downloadName(`${safeSegment(folderName)}.zip`),
      conflictAction: 'uniquify',
      saveAs: false,
    })
    const saved = await confirmChromeDownload(id, 60_000)
    if (!saved.ok) throw new Error(saved.error || 'Chrome did not save the zip.')
    return `Saved the zip to ${describeSavedFile(saved.filename)}.`
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 120_000)
  }
}
