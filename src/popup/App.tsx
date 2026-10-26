import { useEffect, useState } from 'react'
import { allowedSorts, countAllAllowed, dateFilterAllowed, defaultSort, isSortable, parseSurface, sortBlockReason, surfaceTitle } from '../lib/surface'
import { rangeError } from '../lib/range'
import { loadSettings, saveSettings } from '../lib/settings'
import { BATCH_KEY, BATCH_PROGRESS_KEY, clampDelay, clampReels, createJob, isBatchJob, parseHandles, reelsUrl, DEFAULT_DELAY_MS, DEFAULT_REELS, type BatchJob, type BatchProgress } from '../lib/batch'
import {
  DEFAULT_DAILY_CAP,
  DEFAULT_MAX_DEPTH,
  DEFAULT_SNOWBALL_REELS,
  DEFAULT_STRONG_BREAKOUTS,
  DEFAULT_STRONG_MEDIAN,
  DEFAULT_TARGET_STRONG,
  SNOWBALL_KEY,
  SNOWBALL_PROGRESS_KEY,
  createSnowball,
  isSnowballJob,
  plan,
  progressLabel,
  type SnowballJob,
} from '../lib/snowball'
import { DEFAULT_SETTINGS, DEFAULT_TRANSCRIBE_ENDPOINT, type DatePreset, type RangeChoice, type Settings, type SortKey, type Surface } from '../lib/types'

const SORTS: { key: SortKey; label: string; icon: string; hint?: string }[] = [
  { key: 'likes', label: 'Likes', icon: '♡' },
  { key: 'views', label: 'Views', icon: '▷' },
  {
    key: 'outlier',
    label: 'Outlier score',
    icon: 'ϟ',
    hint: "Views divided by this account's average over its recent posts, so breakouts rise to the top.",
  },
  { key: 'comments', label: 'Comments', icon: '▭' },
  {
    key: 'engagement',
    label: 'Engagement rate',
    icon: '↗',
    hint: '(Likes + comments) ÷ views. Posts without views use the follower count instead.',
  },
  {
    key: 'duration',
    label: 'Duration',
    icon: '⏱',
    hint: 'Video length, when Instagram includes it. The same duration is the Duration column in CSV and Excel.',
  },
  {
    key: 'median',
    label: '× median',
    icon: '×',
    hint: 'Views divided by the median views of the posts loaded for this sort.',
  },
  {
    key: 'likeRate',
    label: 'Likes / views',
    icon: '♥',
    hint: 'Likes divided by views. Useful for spotting posts that reached a lot of people but earned few likes.',
  },
  {
    key: 'commentRate',
    label: 'Comments / views',
    icon: '▭',
    hint: 'Comments divided by views.',
  },
  { key: 'newest', label: 'Newest', icon: '◴' },
  { key: 'oldest', label: 'Oldest', icon: '◷' },
]

const COUNTS = [25, 50, 100, 200, 1000] as const

const DATES: { value: DatePreset; label: string }[] = [
  { value: '7d', label: 'Past week' },
  { value: '30d', label: 'Past month' },
  { value: '90d', label: 'Past 3 months' },
  { value: '180d', label: 'Past 6 months' },
  { value: '365d', label: 'Past year' },
  { value: 'custom', label: 'Custom range' },
]

type CountValue = (typeof COUNTS)[number] | 'all' | 'custom'

export function App() {
  const [surface, setSurface] = useState<Surface>({ kind: 'other' })
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<'posts' | 'date'>('posts')
  const [count, setCount] = useState<CountValue>(25)
  const [customCount, setCustomCount] = useState('40')
  const [date, setDate] = useState<DatePreset>('7d')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<SortKey | 'download' | null>(null)
  const [bridgeOn, setBridgeOn] = useState(false)
  const [handlesText, setHandlesText] = useState('')
  const [batchReels, setBatchReels] = useState(String(DEFAULT_REELS))
  const [batchDelay, setBatchDelay] = useState(String(DEFAULT_DELAY_MS))
  const [batchJob, setBatchJob] = useState<BatchJob | null>(null)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [snowText, setSnowText] = useState('')
  const [snowJob, setSnowJob] = useState<SnowballJob | null>(null)
  const [snowProgress, setSnowProgress] = useState('')
  const [snowReels, setSnowReels] = useState(String(DEFAULT_SNOWBALL_REELS))
  const [snowDelay, setSnowDelay] = useState(String(DEFAULT_DELAY_MS))
  const [snowDaily, setSnowDaily] = useState(String(DEFAULT_DAILY_CAP))
  const [snowBreakouts, setSnowBreakouts] = useState(String(DEFAULT_STRONG_BREAKOUTS))
  const [snowMedian, setSnowMedian] = useState(String(DEFAULT_STRONG_MEDIAN))
  const [snowTarget, setSnowTarget] = useState(String(DEFAULT_TARGET_STRONG))
  const [snowDepth, setSnowDepth] = useState(String(DEFAULT_MAX_DEPTH))
  const [snowRatio, setSnowRatio] = useState('20')
  const [snowFollowing, setSnowFollowing] = useState('40')
  const [snowMinFollowers, setSnowMinFollowers] = useState('')
  const [snowMaxFollowers, setSnowMaxFollowers] = useState('')
  const [snowEngagement, setSnowEngagement] = useState('')

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      setSurface(parseSurface(tab?.url || ''))
      setSettings(await loadSettings())
      const bridge = await chrome.runtime.sendMessage({ type: 'BRIDGE_STATUS' }).catch(() => null)
      setBridgeOn(Boolean(bridge?.connected))
      const stored = await chrome.storage.local.get([BATCH_KEY, BATCH_PROGRESS_KEY, SNOWBALL_KEY, SNOWBALL_PROGRESS_KEY])
      setBatchJob(isBatchJob(stored[BATCH_KEY]) ? stored[BATCH_KEY] : null)
      setBatchProgress((stored[BATCH_PROGRESS_KEY] as BatchProgress | undefined) ?? null)
      setSnowJob(isSnowballJob(stored[SNOWBALL_KEY]) ? stored[SNOWBALL_KEY] : null)
      setSnowProgress(typeof stored[SNOWBALL_PROGRESS_KEY] === 'string' ? stored[SNOWBALL_PROGRESS_KEY] : '')
      setReady(true)
    })()
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return
      if (changes[BATCH_KEY]) setBatchJob(isBatchJob(changes[BATCH_KEY].newValue) ? changes[BATCH_KEY].newValue as BatchJob : null)
      if (changes[BATCH_PROGRESS_KEY]) setBatchProgress((changes[BATCH_PROGRESS_KEY].newValue as BatchProgress | undefined) ?? null)
      if (changes[SNOWBALL_KEY]) setSnowJob(isSnowballJob(changes[SNOWBALL_KEY].newValue) ? changes[SNOWBALL_KEY].newValue as SnowballJob : null)
      if (changes[SNOWBALL_PROGRESS_KEY]) setSnowProgress(typeof changes[SNOWBALL_PROGRESS_KEY].newValue === 'string' ? changes[SNOWBALL_PROGRESS_KEY].newValue : '')
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  async function updateSettings(next: Settings) {
    setSettings(next)
    await saveSettings(next)
  }

  async function saveEndpoint() {
    const endpoint = settings.transcribeEndpoint.trim() || DEFAULT_TRANSCRIBE_ENDPOINT
    let origin: string
    try {
      const url = new URL(endpoint)
      origin = `${url.protocol}//${url.hostname}/*`
    } catch {
      setError('That transcription endpoint is not a valid URL.')
      return
    }
    setError('')
    if (!endpoint.startsWith('https://api.openai.com/')) {
      const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false)
      if (!granted) {
        setError('Chrome needs permission to reach that endpoint. The setting was not saved.')
        return
      }
    }
    await updateSettings({ ...settings, transcribeEndpoint: endpoint })
  }

  function choice(): RangeChoice {
    if (mode === 'date') {
      const range: RangeChoice = { count: 'all', date }
      if (date === 'custom') {
        range.start = start ? dayStart(start) : undefined
        range.end = end ? dayEnd(end) : undefined
      }
      return range
    }
    return { count: count === 'custom' ? Number(customCount) : count, date: 'none' }
  }

  async function activeTab(): Promise<chrome.tabs.Tab> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('Open an Instagram tab first.')
    return tab
  }

  async function sort(key: SortKey) {
    setError('')
    const blocked = sortBlockReason(surface, key)
    if (blocked) {
      setError(blocked)
      return
    }
    const range = choice()
    const problem = rangeError(surface, range)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(key)
    try {
      const tab = await activeTab()
      const response = await chrome.tabs.sendMessage(tab.id as number, { type: 'SORT', range, sortKey: key })
      if (!response?.ok) {
        setError(response?.error || 'Could not sort this page.')
        return
      }
      window.close()
    } catch {
      setError('This Instagram tab has not loaded the extension yet. Refresh it, then try again.')
    } finally {
      setBusy(null)
    }
  }

  async function openBatch(url: string) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id && tab.url?.includes('instagram.com')) {
      const same = tab.url.split('?')[0]?.replace(/\/+$/, '') === url.replace(/\/+$/, '')
      if (same) await chrome.tabs.sendMessage(tab.id, { type: 'RESUME_BATCH' }).catch(() => undefined)
      else await chrome.tabs.update(tab.id, { url })
    } else {
      await chrome.tabs.create({ url })
    }
    window.close()
  }

  async function runBatch() {
    setError('')
    const handles = parseHandles(handlesText)
    if (handles.length === 0) {
      setError('Paste at least one Instagram handle.')
      return
    }
    const job = createJob(handles, clampReels(Number(batchReels)), clampDelay(Number(batchDelay)))
    await chrome.storage.local.set({ [BATCH_KEY]: job })
    await openBatch(reelsUrl(handles[0]))
  }

  async function resumeBatchRun() {
    setError('')
    const stored = await chrome.storage.local.get(BATCH_KEY)
    const job = isBatchJob(stored[BATCH_KEY]) ? stored[BATCH_KEY] : null
    if (!job || job.index >= job.handles.length) {
      setError('No paused batch to resume.')
      return
    }
    await openBatch(reelsUrl(job.handles[job.index] || job.handles[0]))
  }

  async function openSnowball(url: string) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id && tab.url?.includes('instagram.com')) {
      const same = tab.url.split('?')[0]?.replace(/\/+$/, '') === url.replace(/\/+$/, '')
      if (same) await chrome.tabs.sendMessage(tab.id, { type: 'RESUME_SNOWBALL' }).catch(() => undefined)
      else await chrome.tabs.update(tab.id, { url })
    } else {
      await chrome.tabs.create({ url })
    }
    window.close()
  }

  function snowSettings() {
    const minFollowers = snowMinFollowers.trim() === '' ? null : Number(snowMinFollowers)
    const maxFollowers = snowMaxFollowers.trim() === '' ? null : Number(snowMaxFollowers)
    return {
      reelsPerAccount: Number(snowReels),
      delayMs: Number(snowDelay),
      dailyCap: Number(snowDaily),
      strongBreakouts: Number(snowBreakouts),
      strongMedianViews: Number(snowMedian),
      targetStrong: Number(snowTarget),
      maxDepth: Number(snowDepth),
      minStrongRatio: Number(snowRatio) / 100,
      followingCap: Number(snowFollowing),
      minFollowers,
      maxFollowers,
      minEngagement: snowEngagement.trim() === '' ? null : Number(snowEngagement) / 100,
    }
  }

  async function runSnowball() {
    setError('')
    if (batchJob?.status === 'running') {
      setError('Pause the batch before starting a snowball.')
      return
    }
    const seeds = parseHandles(snowText).slice(0, 20)
    if (seeds.length === 0) {
      setError('Paste at least one Instagram handle to seed the snowball.')
      return
    }
    const job = createSnowball(seeds, snowSettings())
    await chrome.storage.local.set({ [SNOWBALL_KEY]: job, [SNOWBALL_PROGRESS_KEY]: progressLabel(job) })
    await openSnowball(reelsUrl(seeds[0]))
  }

  async function resumeSnowballCrawl() {
    setError('')
    const stored = await chrome.storage.local.get(SNOWBALL_KEY)
    const job = isSnowballJob(stored[SNOWBALL_KEY]) ? stored[SNOWBALL_KEY] : null
    if (!job || job.status === 'done') {
      setError('No paused snowball to resume.')
      return
    }
    const planned = plan({ ...job, status: 'running' })
    const next = planned.step.type === 'score' ? planned.step.username : undefined
    if (next) {
      await openSnowball(reelsUrl(next))
      return
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id && tab.url?.includes('instagram.com')) {
      await chrome.tabs.sendMessage(tab.id, { type: 'RESUME_SNOWBALL' }).catch(() => undefined)
      window.close()
      return
    }
    await openSnowball('https://www.instagram.com/')
  }

  async function pauseSnowballCrawl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'PAUSE_SNOWBALL' }).catch(() => undefined)
    const stored = await chrome.storage.local.get(SNOWBALL_KEY)
    if (isSnowballJob(stored[SNOWBALL_KEY]) && stored[SNOWBALL_KEY].status === 'running') {
      await chrome.storage.local.set({ [SNOWBALL_KEY]: { ...stored[SNOWBALL_KEY], status: 'paused', note: 'Paused.', updatedAt: Date.now() } })
    }
  }

  async function pauseBatchRun() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'PAUSE_BATCH' }).catch(() => undefined)
    const stored = await chrome.storage.local.get(BATCH_KEY)
    if (isBatchJob(stored[BATCH_KEY]) && stored[BATCH_KEY].status === 'running') {
      await chrome.storage.local.set({ [BATCH_KEY]: { ...stored[BATCH_KEY], status: 'paused', updatedAt: Date.now() } })
    }
  }

  async function downloadHere() {
    setError('')
    setBusy('download')
    try {
      const tab = await activeTab()
      const response = await chrome.tabs.sendMessage(tab.id as number, { type: 'DOWNLOAD_CURRENT' })
      if (!response?.ok) setError(response?.error || 'Could not download from this page.')
      else window.close()
    } catch {
      setError('Refresh the Instagram tab, then try the download again.')
    } finally {
      setBusy(null)
    }
  }

  const sortable = isSortable(surface)
  const allowed = allowedSorts(surface)
  const datesOk = dateFilterAllowed(surface)
  const preferred = defaultSort(surface)

  return (
    <main>
      <header className="top">
        <h1>
          <span className="logo" aria-hidden="true">
            ⇅
          </span>
          Feed Sorter
        </h1>
        <div className="row">
          <button
            type="button"
            className="icon"
            aria-label="Settings"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((open) => !open)}
          >
            ⚙
          </button>
        </div>
      </header>

      {showSettings && (
        <section className="card settings">
          <label>
            <input
              type="checkbox"
              checked={settings.openMode === 'player'}
              onChange={(event) => void updateSettings({ ...settings, openMode: event.target.checked ? 'player' : 'instagram' })}
            />
            Open sorted posts in the player
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.showDownload}
              onChange={(event) => void updateSettings({ ...settings, showDownload: event.target.checked })}
            />
            Download button on posts
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.showSave}
              onChange={(event) => void updateSettings({ ...settings, showSave: event.target.checked })}
            />
            Save button on posts
          </label>
          <p className="label">Transcription (Whisper-compatible)</p>
          <input
            className="field"
            type="password"
            placeholder="API key"
            value={settings.transcribeKey}
            autoComplete="off"
            onChange={(event) => setSettings({ ...settings, transcribeKey: event.target.value })}
            onBlur={() => void updateSettings(settings)}
          />
          <input
            className="field"
            placeholder={DEFAULT_TRANSCRIBE_ENDPOINT}
            value={settings.transcribeEndpoint}
            onChange={(event) => setSettings({ ...settings, transcribeEndpoint: event.target.value })}
            onBlur={() => void saveEndpoint()}
          />
          <input
            className="field"
            placeholder="whisper-1"
            value={settings.transcribeModel}
            onChange={(event) => setSettings({ ...settings, transcribeModel: event.target.value })}
            onBlur={() => void updateSettings(settings)}
          />
          <p className="muted small">The key stays in this browser. Only the video you transcribe is sent to that endpoint.</p>
        </section>
      )}

      <section className="card">
        <p className="label">Batch reels</p>
        <textarea
          className="field"
          value={handlesText}
          placeholder={'@ada\nhttps://www.instagram.com/bob/'}
          aria-label="Instagram handles, one per line"
          onChange={(event) => setHandlesText(event.target.value)}
        />
        <div className="row">
          <input
            className="field"
            type="number"
            min={1}
            max={200}
            value={batchReels}
            aria-label="Reels per account"
            onChange={(event) => setBatchReels(event.target.value)}
          />
          <input
            className="field"
            type="number"
            min={400}
            max={10000}
            step={100}
            value={batchDelay}
            aria-label="Delay between Instagram requests in milliseconds"
            onChange={(event) => setBatchDelay(event.target.value)}
          />
        </div>
        <p className="muted small">Reels per account, then milliseconds between requests. The tab visits each Reels page and can be resumed if it stops.</p>
        <div className="row">
          <button type="button" className="primary" disabled={busy != null} onClick={() => void runBatch()}>
            Run batch
          </button>
          {batchJob && batchJob.status !== 'done' && (
            <button type="button" disabled={busy != null} onClick={() => void resumeBatchRun()}>
              Resume
            </button>
          )}
          {batchJob?.status === 'running' && (
            <button type="button" onClick={() => void pauseBatchRun()}>
              Pause
            </button>
          )}
        </div>
        {batchJob && (
          <p className="muted small">
            {batchProgress
              ? `${batchProgress.index}/${batchProgress.total} @${batchProgress.handle} · ${batchProgress.collected} reels`
              : `${batchJob.status} · ${batchJob.index}/${batchJob.handles.length}`}
            {batchJob.note ? ` · ${batchJob.note}` : ''}
          </p>
        )}
      </section>

      <section className="card">
        <p className="label">Snowball research</p>
        <textarea
          className="field"
          value={snowText}
          placeholder={'Paste 10–20 seed handles\n@ada\nhttps://www.instagram.com/bob/'}
          aria-label="Snowball seed handles, one per line"
          onChange={(event) => setSnowText(event.target.value)}
        />
        <p className="muted small">Scores each account from its Reels, then expands only STRONG accounts through following and suggested lists. Read-only.</p>
        <details className="fold">
          <summary>Thresholds and caps</summary>
          <div className="row">
            <input className="field" type="number" min={1} max={100} value={snowReels} aria-label="Reels scored per account" onChange={(event) => setSnowReels(event.target.value)} />
            <input className="field" type="number" min={400} max={10000} step={100} value={snowDelay} aria-label="Delay between requests in milliseconds" onChange={(event) => setSnowDelay(event.target.value)} />
            <input className="field" type="number" min={1} max={200} value={snowDaily} aria-label="Accounts scored per UTC day" onChange={(event) => setSnowDaily(event.target.value)} />
          </div>
          <div className="row">
            <input className="field" type="number" min={1} max={30} value={snowBreakouts} aria-label="Minimum unpaid reels at 3 times median for STRONG" onChange={(event) => setSnowBreakouts(event.target.value)} />
            <input className="field" type="number" min={0} value={snowMedian} aria-label="Minimum median views for STRONG" onChange={(event) => setSnowMedian(event.target.value)} />
            <input className="field" type="number" min={0} max={100} value={snowEngagement} placeholder="Min eng %" aria-label="Minimum engagement percent for STRONG" onChange={(event) => setSnowEngagement(event.target.value)} />
          </div>
          <div className="row">
            <input className="field" type="number" min={1} max={200} value={snowTarget} aria-label="Target count of STRONG accounts" onChange={(event) => setSnowTarget(event.target.value)} />
            <input className="field" type="number" min={0} max={6} value={snowDepth} aria-label="Maximum crawl depth" onChange={(event) => setSnowDepth(event.target.value)} />
            <input className="field" type="number" min={0} max={100} value={snowRatio} aria-label="Minimum percent STRONG before the next ring" onChange={(event) => setSnowRatio(event.target.value)} />
          </div>
          <div className="row">
            <input className="field" type="number" min={0} max={80} value={snowFollowing} aria-label="Following accounts kept per STRONG profile" onChange={(event) => setSnowFollowing(event.target.value)} />
            <input className="field" type="number" min={0} value={snowMinFollowers} placeholder="Min followers" aria-label="Minimum follower count" onChange={(event) => setSnowMinFollowers(event.target.value)} />
            <input className="field" type="number" min={0} value={snowMaxFollowers} placeholder="Max followers" aria-label="Maximum follower count" onChange={(event) => setSnowMaxFollowers(event.target.value)} />
          </div>
          <p className="muted small">Reels, delay (ms), daily cap. Then unpaid 3× reels, median views, and an optional engagement percent for STRONG. Then target, max depth, and the minimum STRONG percent that lets the next ring start. Following cap and optional follower range filter the queue.</p>
        </details>
        <div className="row">
          {snowJob?.status !== 'running' && (
            <button type="button" className="primary" disabled={busy != null} onClick={() => void runSnowball()}>
              Run snowball
            </button>
          )}
          {snowJob?.status === 'paused' && (
            <button type="button" disabled={busy != null} onClick={() => void resumeSnowballCrawl()}>
              Resume
            </button>
          )}
          {snowJob?.status === 'running' && (
            <button type="button" onClick={() => void pauseSnowballCrawl()}>
              Pause
            </button>
          )}
        </div>
        {snowJob && (
          <p className="muted small">
            {snowJob.status}
            {snowProgress ? ` · ${snowProgress}` : ` · ${progressLabel(snowJob)}`}
            {snowJob.note ? ` · ${snowJob.note}` : ''}
          </p>
        )}
      </section>

      <button type="button" className="card promo" onClick={() => void chrome.tabs.create({ url: `${chrome.runtime.getURL('src/options/index.html')}#library` })}>
        <span className="mark" aria-hidden="true">
          ▣
        </span>
        <span>
          <strong>Your library</strong>
          <br />
          <span className="muted">Folders for posts you keep on this computer.</span>
        </span>
        <span aria-hidden="true">›</span>
      </button>

      {!ready ? (
        <p className="muted">Checking this tab…</p>
      ) : surface.kind === 'post' || surface.kind === 'stories' ? (
        <section className="card">
          <p>{surface.kind === 'stories' ? 'Stories can be downloaded, not sorted.' : 'This post can be downloaded without sorting.'}</p>
          <button type="button" className="primary" disabled={busy != null} onClick={() => void downloadHere()}>
            {busy === 'download' ? 'Starting…' : 'Download'}
          </button>
        </section>
      ) : !sortable ? (
        <section className="card">
          <p className="label">Choose a feed</p>
          <p className="muted">
            Open a profile, its Reels tab, an Explore search, or a Saved collection. The home feed, messages, and settings
            can’t be sorted.
          </p>
        </section>
      ) : (
        <section className="card">
          <div className="section-head">
            <p className="label">How many</p>
            <div className="switch">
              <button type="button" aria-pressed={mode === 'posts'} onClick={() => setMode('posts')}>
                Count
              </button>
              <button
                type="button"
                aria-pressed={mode === 'date'}
                disabled={!datesOk}
                title={datesOk ? undefined : 'Date ranges are not available on this page.'}
                onClick={() => setMode('date')}
              >
                Dates
              </button>
            </div>
          </div>
          {mode === 'posts' ? (
            <>
              <div className="chips">
                {COUNTS.map((value) => (
                  <button key={value} type="button" aria-pressed={count === value} onClick={() => setCount(value)}>
                    {value >= 1000 ? `${value / 1000}k` : value}
                  </button>
                ))}
                {countAllAllowed(surface) && (
                  <button type="button" aria-pressed={count === 'all'} onClick={() => setCount('all')}>
                    All
                  </button>
                )}
                <button type="button" aria-pressed={count === 'custom'} onClick={() => setCount('custom')}>
                  Custom
                </button>
              </div>
              {count === 'custom' && (
                <input
                  className="field"
                  value={customCount}
                  inputMode="numeric"
                  aria-label="Number of posts"
                  onChange={(event) => setCustomCount(event.target.value)}
                />
              )}
            </>
          ) : (
            <>
              <div className="chips">
                {DATES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={date === option.value}
                    onClick={() => setDate(option.value)}
                  >
                    {option.label.replace('Past ', '')}
                  </button>
                ))}
              </div>
              {date === 'custom' && (
                <div className="row">
                  <input className="field" type="date" value={start} aria-label="Start date" onChange={(event) => setStart(event.target.value)} />
                  <input className="field" type="date" value={end} aria-label="End date" onChange={(event) => setEnd(event.target.value)} />
                </div>
              )}
            </>
          )}

          <p className="label">Rank by</p>
          <div className="ranks">
            {SORTS.map((item) => {
              const available = allowed.includes(item.key)
              return (
                <button
                  key={item.key}
                  type="button"
                  className={item.key === preferred ? 'rank preferred' : 'rank'}
                  aria-disabled={!available}
                  title={item.hint || (available ? undefined : sortBlockReason(surface, item.key) ?? undefined)}
                  disabled={busy != null}
                  onClick={() => void sort(item.key)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {busy === item.key ? 'Working…' : item.label}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      <p className="muted small">
        {bridgeOn
          ? 'Cursor is connected. It can sort through this signed-in window, and it only reads.'
          : 'Agent bridge is off. Enable Feed Sorter in Cursor’s MCP settings, then reload this extension.'}
      </p>

      <footer className="foot">
        <span className="muted">{ready ? surfaceTitle(surface) : ''}</span>
      </footer>
    </main>
  )
}

function dayStart(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day).getTime()
}

function dayEnd(value: string): number {
  return dayStart(value) + 86_400_000 - 1
}
