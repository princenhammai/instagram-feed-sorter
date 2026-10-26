import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FinderDock } from './FinderDock'
import { InlinePanel } from './inline'
import {
  cancelDownload,
  closeOverlay,
  closeSimilar,
  createFolder,
  downloadPosts,
  downloadRanked,
  downloadShortcode,
  exportPosts,
  exportSimilar,
  listFolders,
  openInstagram,
  openSimilar,
  savePost,
  savePosts,
  sortSimilar,
  stopCollect,
  transcribePost,
  downloadCurrent,
  ensureVideo,
  type ExportFormat,
} from '../controller'
import { notify, useSnap, type DownloadState, type ReadyModel } from '../store'
import type { Folder } from '../../lib/db'
import { applyFilters, EMPTY_FILTERS, filtersActive, histogram, metricBounds, type FilterState, type MetricKey } from '../../lib/filters'
import { hasPlayableVideo, mediaByShortcode } from '../api'
import {
  cornerLabel,
  formatCount,
  formatDateTime,
  formatDuration,
  formatMultiple,
  formatPercent,
  humanError,
} from '../../lib/format'
import { headline } from '../../lib/headline'
import { captionHook } from '../../lib/research'
import { boltTiers } from '../../lib/outlier'
import { postsInOrder, searchPosts, sortPosts } from '../../lib/sort'
import { allowedSorts, parseSurface, similarAllowed } from '../../lib/surface'
import type { Post, RangeChoice, SortKey } from '../../lib/types'

const SORT_LABEL: Record<SortKey, string> = {
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  outlier: 'Outlier score',
  engagement: 'Engagement rate',
  duration: 'Duration',
  median: '× median',
  likeRate: 'Likes / views',
  commentRate: 'Comments / views',
  newest: 'Newest',
  oldest: 'Oldest',
}

const EXPORTS: { format: ExportFormat; label: string }[] = [
  { format: 'sheets', label: 'Google Sheets' },
  { format: 'xlsx', label: 'Excel (.xlsx)' },
  { format: 'csv', label: 'CSV' },
  { format: 'json', label: 'JSON' },
  { format: 'clipboard', label: 'Copy to clipboard' },
]

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const PAGE = 120

export function App() {
  const snap = useSnap()
  return (
    <div className="layer">
      {snap.notice && <div className="toast">{snap.notice}</div>}
      {snap.download && snap.phase.type !== 'ready' && (
        <div className="float-progress">
          <Progress download={snap.download} />
        </div>
      )}
      {snap.phase.type === 'collecting' && (
        <Collecting
          label={snap.phase.label}
          percent={snap.phase.percent}
          blocking={snap.phase.scrolling}
        />
      )}
      {snap.phase.type === 'error' && (
        <div className="veil-pill error-pill" role="alert">
          <span>{snap.phase.message}</span>
          <button type="button" className="quiet" onClick={closeOverlay}>Close</button>
        </div>
      )}
      {snap.phase.type === 'ready' && <Workspace key={snap.phase.runId} model={snap.phase.model} />}
      {snap.phase.type === 'idle' && <PageTools />}
    </div>
  )
}

function Progress({ download }: { download: DownloadState }) {
  const percent = download.total > 0 ? Math.round((download.done / download.total) * 100) : 0
  return (
    <div className="progress" role="status">
      <span>
        {download.label} {Math.min(download.done + 1, download.total)} of {download.total} – {percent}%
      </span>
      <span className="track">
        <i style={{ width: `${Math.max(2, percent)}%` }} />
      </span>
      <button type="button" className="ghost" onClick={cancelDownload}>Stop</button>
    </div>
  )
}

function Collecting({ label, percent, blocking }: { label: string; percent: number | null; blocking: boolean }) {
  const veil = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = veil.current
    if (!node || !blocking) return
    const stop = (event: Event) => event.preventDefault()
    node.addEventListener('wheel', stop, { passive: false })
    node.addEventListener('touchmove', stop, { passive: false })
    return () => {
      node.removeEventListener('wheel', stop)
      node.removeEventListener('touchmove', stop)
    }
  }, [blocking])

  return (
    <>
      {blocking && <div ref={veil} className="veil" aria-hidden="true" />}
      <div className="veil-pill" role="status">
        <span>{label}</span>
        {percent != null && <span className="percent">{Math.round(percent)}%</span>}
        <button type="button" className="stop" aria-label="Stop sorting" onClick={stopCollect}>
          <i />
        </button>
        {percent != null && <span className="bar" style={{ width: `${Math.max(2, percent)}%` }} />}
      </div>
    </>
  )
}

const TITLE: Record<SortKey, string> = {
  views: 'Highest views',
  likes: 'Highest likes',
  comments: 'Most comments',
  outlier: 'Above this account’s usual',
  engagement: 'Highest engagement',
  duration: 'Longest videos',
  median: 'Highest × median views',
  likeRate: 'Highest likes per view',
  commentRate: 'Highest comments per view',
  newest: 'Newest first',
  oldest: 'Oldest first',
}

function nounFor(surface: ReadyModel['surface']): string {
  if (surface.kind === 'reels') return 'Reels'
  if (surface.kind === 'saved-all' || surface.kind === 'saved-collection') return 'Saved Posts'
  return 'Posts'
}

function Workspace({ model }: { model: ReadyModel }) {
  const snap = useSnap()
  const [sortKey, setSortKey] = useState(model.sortKey)
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)
  const [menu, setMenu] = useState<'sort' | 'export' | null>(null)
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [topCount, setTopCount] = useState(10)
  const sentinel = useRef<HTMLDivElement | null>(null)

  const sorted = useMemo(() => sortPosts(model.posts, sortKey), [model.posts, sortKey])
  const searched = useMemo(() => searchPosts(sorted, query), [sorted, query])
  const visible = useMemo(() => applyFilters(searched, applied), [searched, applied])
  const paidCount = useMemo(
    () => applyFilters(searched, { ...applied, hidePaid: false }).filter((post) => post.likelyPaid).length,
    [searched, applied],
  )
  const bolts = useMemo(() => boltTiers(sortKey === 'outlier' ? visible : []), [sortKey, visible])
  const previewCount = applyFilters(searched, draft).length
  const target = selecting ? postsInOrder(visible, selected) : visible
  const active = filtersActive(applied, sorted) || query.trim() !== ''
  const outlierWarning =
    sortKey === 'outlier' && model.posts.every((post) => post.outlierScore == null)
      ? 'Not enough posts older than 3 days to score outliers.'
      : null

  useEffect(() => setShown(PAGE), [sortKey, applied, query])

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown((count) => count + PAGE)
      },
      { rootMargin: '1200px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible.length, shown])

  function toggle(post: Post) {
    setSelected((current) => (current.includes(post.id) ? current.filter((id) => id !== post.id) : [...current, post.id]))
  }

  function openPost(post: Post) {
    if (selecting) {
      toggle(post)
      return
    }
    if (snap.settings.openMode === 'instagram') openInstagram(post.url, true)
    else setDetailId(post.id)
  }

  function chooseMetric(metric: MetricKey | '') {
    if (!metric) {
      setDraft((current) => ({ ...current, metric: null, min: null, max: null }))
      return
    }
    const bounds = metricBounds(sorted, metric)
    setDraft((current) => ({ ...current, metric, min: bounds?.min ?? null, max: bounds?.max ?? null }))
  }

  function clearAll() {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setQuery('')
  }

  const detailIndex = detailId ? visible.findIndex((post) => post.id === detailId) : -1
  const noun = nounFor(model.surface)
  const span = headline(model.surface, model.range).match(/ from (.+)$/)?.[1]

  const panel = (
    <section className="panel">
      <header className="panel-head">
        <div>
          <p className="kicker">{TITLE[sortKey]}</p>
          <h1>
            {visible.length.toLocaleString()} {noun}
            {span ? <span className="quiet-title"> · {span}</span> : null}
          </h1>
          {visible.length !== model.posts.length && (
            <p className="note">Filtered from {model.posts.length.toLocaleString()}</p>
          )}
          {outlierWarning && <p className="note">{outlierWarning}</p>}
        </div>
        <div className="actions">
          {similarAllowed(model.surface) && (
            <button type="button" className="ghost" onClick={() => void openSimilar(usernameOf(model.surface))}>
              Related accounts
            </button>
          )}
          <button
            type="button"
            className="ghost"
            disabled={target.length === 0 || Boolean(snap.download)}
            onClick={() => void downloadPosts(model.surface, target)}
          >
            Get media <span className="count">{target.length.toLocaleString()}</span>
          </button>
          {selecting && (
            <SaveMenu
              label={`Save ${target.length}`}
              disabled={target.length === 0}
              onPick={(folder) => void savePosts(target, folder)}
            />
          )}
          <div className="menu">
            <button
              type="button"
              className="outline"
              disabled={target.length === 0}
              onClick={() => setMenu(menu === 'export' ? null : 'export')}
            >
              Export data <span className="count">{target.length.toLocaleString()}</span>
            </button>
            {menu === 'export' && (
              <div>
                {EXPORTS.map((item) => (
                  <button
                    key={item.format}
                    type="button"
                    onClick={() => {
                      setMenu(null)
                      void exportPosts(model.surface, target, item.format)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="ghost close" aria-label="Close sorted grid" onClick={closeOverlay}>
            ×
          </button>
        </div>
      </header>
      {snap.download && (
        <div className="panel-progress">
          <Progress download={snap.download} />
        </div>
      )}
      <div className="toolbar">
        <div className="row">
          <button
            type="button"
            className={filtersActive(applied, sorted) ? 'ghost dot' : 'ghost'}
            onClick={() => {
              setDraft(applied)
              setFiltersOpen((open) => !open)
            }}
          >
            ☰ Filters
          </button>
          <div className="menu left">
            <button type="button" className="ghost" onClick={() => setMenu(menu === 'sort' ? null : 'sort')}>
              ⇅ Sort by <span className="count">{SORT_LABEL[sortKey]}</span>
            </button>
            {menu === 'sort' && (
              <div>
                {allowedSorts(model.surface).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-current={key === sortKey}
                    onClick={() => {
                      setSortKey(key)
                      setMenu(null)
                    }}
                  >
                    {SORT_LABEL[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="ghost muted" disabled={!active} onClick={clearAll}>
            Clear all
          </button>
          <button
            type="button"
            className={applied.hidePaid ? 'ghost dot' : 'ghost'}
            aria-pressed={applied.hidePaid}
            onClick={() => {
              const next = { ...applied, hidePaid: !applied.hidePaid }
              setApplied(next)
              setDraft(next)
            }}
          >
            Hide likely paid
            <span className="count">{paidCount}</span>
          </button>
          <div className="row top-n">
            <button
              type="button"
              className="ghost"
              disabled={visible.length === 0 || Boolean(snap.download)}
              title="Saves rank01_shortcode.mp4 and the rest of this sort into Downloads, with no save dialog per file."
              onClick={() => {
                const count = Math.max(1, Math.min(visible.length, Math.floor(topCount) || 1))
                void downloadRanked(model.surface, visible.slice(0, count))
              }}
            >
              Download top
            </button>
            <input
              type="number"
              min={1}
              max={Math.max(1, visible.length)}
              value={topCount}
              aria-label="How many videos to download from the top of this sort"
              onChange={(event) => setTopCount(Number(event.target.value))}
            />
          </div>
        </div>
        <div className="row">
          <input
            className="search"
            type="search"
            value={query}
            placeholder="Search captions…"
            aria-label="Search within results"
            onChange={(event) => setQuery(event.target.value)}
          />
          {selecting ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setSelecting(false)
                setSelected([])
              }}
            >
              Cancel
            </button>
          ) : (
            <button type="button" className="ghost" onClick={() => setSelecting(true)}>
              ✓ Select
            </button>
          )}
        </div>
      </div>
      {filtersOpen && (
        <div className="filters">
          <label>
            Metric
            <select value={draft.metric ?? ''} onChange={(event) => chooseMetric(event.target.value as MetricKey | '')}>
              <option value="">Any</option>
              <option value="views">Views</option>
              <option value="likes">Likes</option>
              <option value="comments">Comments</option>
            </select>
          </label>
          {draft.metric && <Histogram posts={sorted} metric={draft.metric} min={draft.min} max={draft.max} />}
          <label>
            Min
            <input
              type="number"
              value={draft.min ?? ''}
              onChange={(event) => setDraft({ ...draft, min: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
          <label>
            Max
            <input
              type="number"
              value={draft.max ?? ''}
              onChange={(event) => setDraft({ ...draft, max: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
          <fieldset className="row">
            <legend className="kicker">Posted</legend>
            <label>
              <span>In the last</span>
              <input
                type="radio"
                checked={draft.posted.mode === 'last'}
                onChange={() => setDraft({ ...draft, posted: { mode: 'last', amount: 7, unit: 'days' } })}
              />
            </label>
            {draft.posted.mode === 'last' && (
              <>
                <input
                  type="number"
                  min={1}
                  value={draft.posted.amount}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      posted: { mode: 'last', amount: Number(event.target.value), unit: draft.posted.mode === 'last' ? draft.posted.unit : 'days' },
                    })
                  }
                />
                <select
                  value={draft.posted.unit}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      posted: {
                        mode: 'last',
                        amount: draft.posted.mode === 'last' ? draft.posted.amount : 7,
                        unit: event.target.value as 'days' | 'weeks' | 'months' | 'years',
                      },
                    })
                  }
                >
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                  <option value="months">months</option>
                  <option value="years">years</option>
                </select>
              </>
            )}
            <label>
              <span>Between</span>
              <input
                type="radio"
                checked={draft.posted.mode === 'between'}
                onChange={() => setDraft({ ...draft, posted: { mode: 'between', start: null, end: null } })}
              />
            </label>
            {draft.posted.mode === 'between' && (
              <>
                <input type="date" onChange={(event) => setDraft({ ...draft, posted: { mode: 'between', start: dayStart(event.target.value), end: draft.posted.mode === 'between' ? draft.posted.end : null } })} />
                <input type="date" onChange={(event) => setDraft({ ...draft, posted: { mode: 'between', start: draft.posted.mode === 'between' ? draft.posted.start : null, end: dayEnd(event.target.value) } })} />
              </>
            )}
          </fieldset>
          <button type="button" className="primary" onClick={() => { setApplied(draft); setFiltersOpen(false) }}>
            Show {previewCount}
          </button>
          <button type="button" className="quiet" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}
      {selecting && (
        <div className="select-bar">
          <button type="button" className="ghost" onClick={() => setSelected(visible.map((post) => post.id))}>
            Select all {visible.length.toLocaleString()}
          </button>
          <button type="button" className="ghost" onClick={() => setSelected([])}>None</button>
          <span>{selected.length} selected — Download, Export and Save use only these</span>
        </div>
      )}
      {visible.length === 0 ? (
        <p className="empty">No posts match these filters.</p>
      ) : (
        <div className={selecting ? 'grid selecting' : 'grid'}>
          {visible.slice(0, shown).map((post) => {
            const picked = selected.includes(post.id)
            const hook = captionHook(post.caption)
            return (
              <article key={post.id} className={picked ? 'tile picked' : 'tile'}>
                <button type="button" className="shot" onClick={() => openPost(post)}>
                  {post.coverUrl ? (
                    <img src={post.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="empty">No preview</span>
                  )}
                  <span className="metric">{cornerLabel(post, sortKey)}</span>
                  <span className="hover-counts">
                    <span>▶ {formatCount(post.views)}</span>
                    <span>♥ {formatCount(post.likes)}</span>
                    <span>💬 {formatCount(post.comments)}</span>
                    <span>↗ {formatPercent(post.engagementRate)}</span>
                    {post.medianScore != null && <span>{formatMultiple(post.medianScore)} median</span>}
                    {post.likeRate != null && <span>♥/▶ {formatPercent(post.likeRate)}</span>}
                    {post.commentRate != null && <span>💬/▶ {formatPercent(post.commentRate)}</span>}
                    {post.outlierScore != null && <span>⚡ {formatMultiple(post.outlierScore)}</span>}
                  </span>
                </button>
                {(hook || post.caption) && <p className="blurb">{hook || post.caption.split('\n')[0]}</p>}
                {(post.likelyPaid || post.medianScore != null || post.likeRate != null || post.commentRate != null || post.duration != null || post.audio) && (
                  <p className="meta-line">
                    {post.likelyPaid && <span className="paid">Likely paid</span>}
                    {post.medianScore != null && <span>{formatMultiple(post.medianScore)} median</span>}
                    {post.likeRate != null && <span>{formatPercent(post.likeRate)} likes</span>}
                    {post.commentRate != null && <span>{formatPercent(post.commentRate)} comments</span>}
                    {post.duration != null && <span>{formatDuration(post.duration)}</span>}
                    {post.audio && <span className="audio">{post.audio}</span>}
                  </p>
                )}
                {bolts.get(post.id) ? <span className="bolts">{'⚡'.repeat(bolts.get(post.id) ?? 1)}</span> : null}
                {selecting && (
                  <button type="button" className="check" aria-pressed={picked} onClick={() => toggle(post)}>
                    {picked ? '✓' : ''}
                  </button>
                )}
                {!selecting && (
                  <div className="card-actions">
                    {snap.settings.showSave && (
                      <button type="button" onClick={() => void savePost(post)}>Save</button>
                    )}
                    {snap.settings.showDownload && (
                      <button type="button" onClick={() => void downloadPosts(model.surface, [post])}>⤓</button>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
      {shown < visible.length && <div ref={sentinel} className="more">Loading more…</div>}
    </section>
  )

  return (
    <>
      <InlinePanel surface={model.surface}>{panel}</InlinePanel>
      {detailIndex >= 0 && (
        <DetailModal
          posts={visible}
          index={detailIndex}
          sortKey={sortKey}
          onIndex={(index) => setDetailId(visible[index]?.id ?? null)}
          onClose={() => setDetailId(null)}
          onDownload={(post) => void downloadPosts(model.surface, [post])}
        />
      )}
      {snap.similar.open && <Similar username={usernameOf(model.surface)} range={model.range} sortKey={sortKey} />}
    </>
  )
}

function usernameOf(surface: ReadyModel['surface']): string {
  return 'username' in surface ? surface.username : 'instagram'
}

function dayStart(value: string): number | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function dayEnd(value: string): number | null {
  const start = dayStart(value)
  return start == null ? null : start + 86_400_000 - 1
}

function Histogram({ posts, metric, min, max }: { posts: Post[]; metric: MetricKey; min: number | null; max: number | null }) {
  const values = posts.map((post) => post[metric]).filter((value): value is number => value != null)
  const bins = histogram(values)
  const peak = Math.max(1, ...bins.map((bin) => bin.count))
  return (
    <div className="hist" aria-hidden="true">
      {bins.map((bin) => {
        const on = (min == null || bin.to >= min) && (max == null || bin.from <= max)
        return <i key={`${bin.from}-${bin.to}`} className={on ? 'on' : undefined} style={{ height: `${Math.max(8, (bin.count / peak) * 100)}%` }} />
      })}
    </div>
  )
}

function SaveMenu({
  label,
  disabled,
  onPick,
  up,
}: {
  label: ReactNode
  disabled?: boolean
  onPick: (folder: Folder) => void
  up?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    let live = true
    void listFolders()
      .then((list) => live && setFolders(list))
      .catch(() => live && setFolders([]))
    return () => {
      live = false
    }
  }, [open])

  function pick(folder: Folder) {
    setOpen(false)
    onPick(folder)
  }

  async function create() {
    const folder = await createFolder(name)
    if (!folder) return
    setName('')
    pick(folder)
  }

  return (
    <div className={up ? 'menu up' : 'menu'}>
      <button type="button" className="outline" disabled={disabled} onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      {open && (
        <div className="folder-menu">
          <p className="kicker">Save to collection</p>
          {folders == null && <p className="note">Loading…</p>}
          {folders?.map((folder) => (
            <button key={folder.id} type="button" onClick={() => pick(folder)}>
              ▣ {folder.name}
            </button>
          ))}
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <input value={name} placeholder="New collection" onChange={(event) => setName(event.target.value)} />
            <button type="submit" className="primary" disabled={!name.trim()}>
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

interface TranscriptState {
  loading: boolean
  text: string | null
  error: string | null
}

const NO_TRANSCRIPT: TranscriptState = { loading: false, text: null, error: null }

function DetailModal({
  posts,
  index,
  sortKey,
  onIndex,
  onClose,
  onDownload,
}: {
  posts: Post[]
  index: number
  sortKey: SortKey
  onIndex: (index: number) => void
  onClose: () => void
  onDownload: (post: Post) => void
}) {
  const post = posts[index]
  const video = useRef<HTMLVideoElement | null>(null)
  const [slide, setSlide] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [length, setLength] = useState(0)
  const [rate, setRate] = useState(1)
  const [transcript, setTranscript] = useState<TranscriptState>(NO_TRANSCRIPT)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const gaveUp = useRef(false)

  useEffect(() => {
    setSlide(0)
    setTime(0)
    setLength(0)
    setTranscript(NO_TRANSCRIPT)
    setVideoError(null)
    gaveUp.current = false
    setBlobUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }, [post?.id])

  useEffect(() => {
    if (!post || hasPlayableVideo(post) || post.mediaKind === 'image') return
    let live = true
    setVideoError(null)
    void ensureVideo(post)
      .then((next) => {
        if (live && !hasPlayableVideo(next)) setVideoError('Instagram did not return the video file for this reel.')
      })
      .catch((error: unknown) => {
        if (!live || (error instanceof DOMException && error.name === 'AbortError')) return
        setVideoError(humanError(error))
      })
    return () => {
      live = false
    }
  }, [post])

  useEffect(() => {
    if (video.current) video.current.playbackRate = rate
  }, [rate, post?.id, slide])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.composedPath().some((node) => node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (typing) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        const next = event.key === 'ArrowRight' ? index + 1 : index - 1
        if (next >= 0 && next < posts.length) onIndex(next)
      }
      if (event.key === ' ' && video.current) {
        event.preventDefault()
        event.stopPropagation()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!post) return null
  const current = post.mediaKind === 'carousel' ? post.slides[slide] : null
  const videoSrc = blobUrl || (current ? (current.kind === 'video' ? current.url : null) : post.videoUrl)
  const imageSrc = current ? (current.kind === 'image' ? current.url : null) : post.coverUrl

  function togglePlay() {
    const node = video.current
    if (!node) return
    if (node.paused) void node.play().catch(() => undefined)
    else node.pause()
  }

  async function runTranscribe(force: boolean) {
    setTranscript({ loading: true, text: null, error: null })
    const result = await transcribePost(post, force)
    setTranscript({ loading: false, text: result.ok ? result.text ?? '' : null, error: result.ok ? null : result.error ?? 'Transcription failed.' })
  }

  return (
    <div className="modal" role="dialog" aria-label={`Post ${index + 1} of ${posts.length}`} onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-stage">
          {videoSrc ? (
            <>
              <video
                key={videoSrc}
                ref={video}
                src={videoSrc}
                poster={post.coverUrl ?? undefined}
                autoPlay
                playsInline
                loop
                onClick={togglePlay}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
                onLoadedMetadata={(event) => {
                  setLength(event.currentTarget.duration)
                  event.currentTarget.playbackRate = rate
                }}
                onError={() => {
                  if (gaveUp.current) return
                  if (blobUrl || !post.videoUrl) {
                    gaveUp.current = true
                    setVideoError('The video file could not be played.')
                    return
                  }
                  void fetch(post.videoUrl)
                    .then((response) => {
                      if (!response.ok) throw new Error(String(response.status))
                      return response.blob()
                    })
                    .then((blob) => setBlobUrl(URL.createObjectURL(blob)))
                    .catch(() => setVideoError('The video file could not be played.'))
                }}
              />
              <div className="controls">
                <button type="button" className="ghost" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
                  {playing ? '❚❚' : '▶'}
                </button>
                <input
                  type="range"
                  min={0}
                  max={length || 0}
                  step={0.1}
                  value={Math.min(time, length || 0)}
                  aria-label="Seek"
                  onChange={(event) => {
                    if (video.current) video.current.currentTime = Number(event.target.value)
                  }}
                />
                <span className="time">
                  {formatDuration(time)} / {formatDuration(length || post.duration)}
                </span>
                <select value={rate} aria-label="Playback speed" onChange={(event) => setRate(Number(event.target.value))}>
                  {SPEEDS.map((speed) => (
                    <option key={speed} value={speed}>
                      {speed}×
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : imageSrc ? (
            <>
              <img src={imageSrc} alt="" referrerPolicy="no-referrer" />
              {post.mediaKind !== 'image' && (
                <span className="stage-status">{videoError ?? 'Loading video…'}</span>
              )}
            </>
          ) : (
            <p>No preview</p>
          )}
          {post.slides.length > 1 && (
            <div className="slide-nav">
              <button type="button" className="ghost" disabled={slide === 0} onClick={() => setSlide(slide - 1)}>
                ‹
              </button>
              <span>
                {slide + 1}/{post.slides.length}
              </span>
              <button
                type="button"
                className="ghost"
                disabled={slide >= post.slides.length - 1}
                onClick={() => setSlide(slide + 1)}
              >
                ›
              </button>
            </div>
          )}
        </div>
        <aside className="modal-side">
          <div className="modal-top">
            <div className="pager">
              <button type="button" className="ghost" aria-label="Previous" disabled={index === 0} onClick={() => onIndex(index - 1)}>
                ←
              </button>
              <span>
                {index + 1} of {posts.length}
              </span>
              <button
                type="button"
                className="ghost"
                aria-label="Next"
                disabled={index >= posts.length - 1}
                onClick={() => onIndex(index + 1)}
              >
                →
              </button>
            </div>
            <button type="button" className="ghost close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
          <h2>@{post.username || 'instagram'}</h2>
          <dl className="stats">
            <div>
              <dt>Views</dt>
              <dd>{formatCount(post.views)}</dd>
            </div>
            <div>
              <dt>Likes</dt>
              <dd>{formatCount(post.likes)}</dd>
            </div>
            <div>
              <dt>Comments</dt>
              <dd>{formatCount(post.comments)}</dd>
            </div>
            <div>
              <dt>Engagement</dt>
              <dd>{formatPercent(post.engagementRate)}</dd>
            </div>
            <div>
              <dt>Outlier</dt>
              <dd className={sortKey === 'outlier' ? 'hot' : undefined}>
                {post.outlierScore == null ? '—' : formatMultiple(post.outlierScore)}
              </dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd className={sortKey === 'duration' ? 'hot' : undefined}>{formatDuration(post.duration)}</dd>
            </div>
            <div>
              <dt>× median</dt>
              <dd className={sortKey === 'median' ? 'hot' : undefined}>
                {post.medianScore == null ? '—' : formatMultiple(post.medianScore)}
              </dd>
            </div>
            <div>
              <dt>Likes / views</dt>
              <dd className={sortKey === 'likeRate' ? 'hot' : undefined}>{formatPercent(post.likeRate)}</dd>
            </div>
            <div>
              <dt>Comments / views</dt>
              <dd className={sortKey === 'commentRate' ? 'hot' : undefined}>{formatPercent(post.commentRate)}</dd>
            </div>
          </dl>
          <p className="note">Published {formatDateTime(post.takenAt)}</p>
          {post.audio && <p className="note">Audio · {post.audio}</p>}
          {post.likelyPaid && (
            <p className="paid-note">Likely paid{post.paidSignals && post.paidSignals.length > 0 ? ` · ${post.paidSignals.join(', ')}` : ''}</p>
          )}
          <div className="actions start">
            <SaveMenu label="Save" up onPick={(folder) => void savePost(post, folder)} />
            <button type="button" className="outline" disabled={transcript.loading || !hasVideo(post)} onClick={() => void runTranscribe(false)}>
              {transcript.loading ? 'Transcribing…' : 'Transcribe'}
            </button>
            <button type="button" className="outline" onClick={() => onDownload(post)}>
              Download
            </button>
            <button type="button" className="outline" onClick={() => openInstagram(post.url, true)}>
              Open on Instagram ↗
            </button>
          </div>
          {(transcript.text != null || transcript.error) && (
            <div className="transcript">
              <div className="row spread">
                <p className="kicker">Transcript</p>
                {transcript.text != null && (
                  <div className="row">
                    <button type="button" className="ghost" onClick={() => void navigator.clipboard.writeText(transcript.text ?? '').then(() => notify('Transcript copied.'))}>
                      Copy
                    </button>
                    <button type="button" className="ghost" onClick={() => void runTranscribe(true)}>
                      Redo
                    </button>
                  </div>
                )}
              </div>
              {transcript.error ? <p className="error-text">{transcript.error}</p> : <p>{transcript.text || 'No speech found.'}</p>}
            </div>
          )}
          {captionHook(post.caption) && <p className="hook">{captionHook(post.caption)}</p>}
          <p className="caption">{post.caption || 'No caption'}</p>
          <p className="note">← → move between posts · Space plays or pauses · Esc closes</p>
        </aside>
      </div>
    </div>
  )
}

function hasVideo(post: Post): boolean {
  return Boolean(post.videoUrl || post.slides.some((slide) => slide.kind === 'video'))
}

function Similar({ username, range, sortKey }: { username: string; range: RangeChoice; sortKey: SortKey }) {
  const snap = useSnap()
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState(false)
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const accounts = snap.similar.accounts.filter((account) => {
    const haystack = `${account.username} ${account.fullName} ${account.category ?? ''}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
  return (
    <aside className="similar">
      <div className="actions spread">
        <h2>Accounts near @{username}</h2>
        <button type="button" className="ghost close" aria-label="Close" onClick={closeSimilar}>
          ×
        </button>
      </div>
      <p className="note">
        {snap.similar.loading
          ? 'Checking this profile and Instagram’s suggestions. This can take a few seconds.'
          : snap.similar.accounts.length > 0
            ? `${snap.similar.accounts.length} accounts. Sort opens their Reels with the same sort.`
            : 'Accounts Instagram suggests alongside this one.'}
      </p>
      {snap.similar.accounts.length > 0 && (
        <div className="row spread">
          <input
            className="search"
            type="search"
            value={query}
            placeholder="Search accounts…"
            aria-label="Search similar accounts"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="menu">
            <button type="button" className="outline" onClick={() => setMenu((open) => !open)}>
              Export {snap.similar.accounts.length}
            </button>
            {menu && (
              <div>
                {EXPORTS.map((item) => (
                  <button
                    key={item.format}
                    type="button"
                    onClick={() => {
                      setMenu(false)
                      void exportSimilar(username, item.format)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {snap.similar.loading && <p>Looking up accounts…</p>}
      {snap.similar.error && (
        <p className="error-text">
          {snap.similar.error}{' '}
          <button type="button" className="ghost" onClick={() => void openSimilar(username)}>
            Try again
          </button>
        </p>
      )}
      {accounts.map((account) => (
        <div key={account.username} className="account">
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar" aria-hidden="true" />
          )}
          <span className="who">
            <strong>
              @{account.username}
              {account.verified ? ' ✓' : ''}
            </strong>
            <small>
              {[
                account.fullName,
                account.followers != null ? `${formatCount(account.followers)} followers` : '',
                account.isPrivate ? 'Private' : '',
                account.category ?? '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </span>
          <span className="row">
            <button type="button" className="ghost" onClick={() => openInstagram(account.url, true)}>
              Open
            </button>
            <button type="button" className="outline" onClick={() => sortSimilar(account.username, range, sortKey)}>
              Sort Reels
            </button>
          </span>
        </div>
      ))}
      {!snap.similar.loading && snap.similar.accounts.length > 0 && accounts.length === 0 && (
        <p className="note">No accounts match that search.</p>
      )}
    </aside>
  )
}

function PageTools() {
  const snap = useSnap()
  const surface = parseSurface(snap.href)
  const [hit, setHit] = useState<{ code: string; top: number; left: number } | null>(null)

  useEffect(() => {
    if (!snap.settings.showDownload && !snap.settings.showSave) return
    const onOver = (event: MouseEvent) => {
      const path = event.composedPath()
      if (path.some((node) => node instanceof Element && node.id === 'ifs-root')) return
      const anchor = path.find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)
      const match = anchor?.href.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/)
      if (!anchor || !match?.[1]) {
        setHit(null)
        return
      }
      const rect = anchor.getBoundingClientRect()
      setHit({ code: match[1], top: rect.top + 8, left: rect.left + 8 })
    }
    const onScroll = () => setHit(null)
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [snap.settings.showDownload, snap.settings.showSave])

  return (
    <>
      {hit && (
        <div className="hover-tools" style={{ top: hit.top, left: hit.left }}>
          {snap.settings.showDownload && (
            <button type="button" onClick={() => void downloadShortcode(hit.code)}>Download</button>
          )}
          {snap.settings.showSave && (
            <button type="button" onClick={() => void saveFromCode(hit.code)}>Save</button>
          )}
        </div>
      )}
      {(surface.kind === 'posts' || surface.kind === 'reels') && <FinderDock username={surface.username} />}
      {(surface.kind === 'post' || surface.kind === 'stories') && (snap.settings.showDownload || snap.settings.showSave) && (
        <div className="page-tools">
          {snap.settings.showDownload && (
            <button type="button" className="primary" onClick={() => void downloadCurrent()}>
              {surface.kind === 'stories' ? 'Download story' : 'Download'}
            </button>
          )}
        </div>
      )}
    </>
  )
}

async function saveFromCode(code: string) {
  try {
    const post = await mediaByShortcode(code)
    if (!post) {
      notify('Could not read that post.')
      return
    }
    await savePost(post)
  } catch (error) {
    notify(humanError(error))
  }
}
