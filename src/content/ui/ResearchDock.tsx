import { useEffect, useMemo, useRef, useState } from 'react'
import { ResearchPanel } from './ResearchPanel'
import { kickBatch, loadJob, markPaused, markResumed, queueBatch, resumeBatch } from '../batch-run'
import { hydrateTraces, REQUEST_LOG_KEY, useRequestLog } from '../request-log'
import { downloadRanked, stopCollect } from '../controller'
import { markSnowballPaused, markSnowballResumed, resumeSnowballRun } from '../snowball-run'
import { useSnap } from '../store'
import {
  BATCH_KEY,
  BATCH_PROGRESS_KEY,
  DEFAULT_DELAY_MS,
  DEFAULT_REELS,
  clampReels,
  batchSummaryTable,
  parseHandles,
  reelsUrl,
  type BatchJob,
  type BatchProgress,
} from '../../lib/batch'
import { tableToCsv } from '../../lib/export'
import { downloadName, safeSegment } from '../../lib/media-files'
import {
  RESEARCH_OPEN_KEY,
  TOP_DOWNLOAD,
  VISIBLE_CAP,
  orderResearchRows,
  researchReelTable,
  researchRows,
  researchSummaries,
  type ResearchMode,
  type ResearchSort,
} from '../../lib/research-table'
import {
  DEFAULT_SNOWBALL_REELS,
  MAX_SNOWBALL_REELS,
  SNOWBALL_KEY,
  SNOWBALL_PROGRESS_KEY,
  createSnowball,
  parseKeywords,
  isSnowballJob,
  plan,
  progressLabel,
  type SnowballJob,
} from '../../lib/snowball'
import { SYNC_KEY, cleanSync, notionReady, type SummarySyncRow, type SyncSettings } from '../../lib/sync'
import { buildWorkbook } from '../../lib/xlsx'

const DRAFT_KEY = 'ifs-research-draft'

function problemNote(note: string | undefined, status: string | undefined): string {
  if (!note || status === 'done' || note === 'Paused.') return ''
  if (status === 'paused') return note
  if (/rate limit|429|feedback_required|please wait|daily cap|could not|didn't|private|error|no reels/i.test(note)) return note
  return ''
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

export function ResearchDock() {
  const snap = useSnap()
  const [open, setOpen] = useState(false)
  const [seeds, setSeeds] = useState('')
  const [keywords, setKeywords] = useState('')
  const [reels, setReels] = useState(String(DEFAULT_REELS))
  const [edited, setEdited] = useState(false)
  const [keywordsEdited, setKeywordsEdited] = useState(false)
  const debug = useRequestLog()
  const [mode, setMode] = useState<ResearchMode>('batch')
  const [batchJob, setBatchJob] = useState<BatchJob | null>(null)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [snowJob, setSnowJob] = useState<SnowballJob | null>(null)
  const [snowProgress, setSnowProgress] = useState('')
  const [sort, setSort] = useState<ResearchSort>('median')
  const [showPaid, setShowPaid] = useState(false)
  const [alert, setAlert] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState<'' | 'export' | 'download' | 'sync'>('')
  const hydrated = useRef<{ batch: boolean; snowball: boolean }>({ batch: false, snowball: false })
  const keywordsHydrated = useRef(false)
  const draftReady = useRef(false)

  useEffect(() => {
    const load = async () => {
      const stored = await chrome.storage.local.get([
        BATCH_PROGRESS_KEY,
        SNOWBALL_KEY,
        SNOWBALL_PROGRESS_KEY,
        RESEARCH_OPEN_KEY,
        REQUEST_LOG_KEY,
        DRAFT_KEY,
      ])
      hydrateTraces(stored[REQUEST_LOG_KEY])
      if (!draftReady.current) {
        const draft = stored[DRAFT_KEY] as { seeds?: unknown; keywords?: unknown; reels?: unknown; mode?: unknown } | undefined
        if (draft && typeof draft === 'object') {
          if (typeof draft.seeds === 'string') {
            setSeeds(draft.seeds)
            if (draft.seeds) {
              setEdited(true)
              hydrated.current.batch = true
              hydrated.current.snowball = true
            }
          }
          if (typeof draft.keywords === 'string') {
            setKeywords(draft.keywords)
            if (draft.keywords) {
              setKeywordsEdited(true)
              keywordsHydrated.current = true
            }
          }
          if (typeof draft.reels === 'string' && draft.reels.trim()) {
            setReels(draft.reels)
          }
          if (draft.mode === 'batch' || draft.mode === 'snowball') setMode(draft.mode)
        }
        draftReady.current = true
      }
      const batch = await loadJob()
      const snow = isSnowballJob(stored[SNOWBALL_KEY]) ? stored[SNOWBALL_KEY] : null
      setBatchJob(batch)
      setBatchProgress((stored[BATCH_PROGRESS_KEY] as BatchProgress | undefined) ?? null)
      setSnowJob(snow)
      setSnowProgress(typeof stored[SNOWBALL_PROGRESS_KEY] === 'string' ? stored[SNOWBALL_PROGRESS_KEY] : '')
      if (stored[RESEARCH_OPEN_KEY] || snap.researchOpen || batch?.status === 'running' || snow?.status === 'running') {
        setOpen(true)
        if (stored[RESEARCH_OPEN_KEY]) await chrome.storage.local.remove(RESEARCH_OPEN_KEY)
      }
    }
    void load()
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return
      if (changes[BATCH_KEY]) void loadJob().then(setBatchJob)
      if (changes[BATCH_PROGRESS_KEY]) setBatchProgress((changes[BATCH_PROGRESS_KEY].newValue as BatchProgress | undefined) ?? null)
      if (changes[SNOWBALL_KEY]) setSnowJob(isSnowballJob(changes[SNOWBALL_KEY].newValue) ? changes[SNOWBALL_KEY].newValue as SnowballJob : null)
      if (changes[SNOWBALL_PROGRESS_KEY]) setSnowProgress(typeof changes[SNOWBALL_PROGRESS_KEY].newValue === 'string' ? changes[SNOWBALL_PROGRESS_KEY].newValue : '')
      if (changes[RESEARCH_OPEN_KEY]?.newValue) setOpen(true)
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [snap.researchOpen])

  useEffect(() => {
    if (snap.researchOpen) setOpen(true)
  }, [snap.researchOpen])

  useEffect(() => {
    if (edited || hydrated.current[mode]) return
    const next = mode === 'batch' ? batchJob?.handles.join('\n') : snowJob?.seeds?.join('\n')
    if (!next) return
    hydrated.current[mode] = true
    setSeeds(next)
  }, [mode, batchJob, snowJob, edited])

  useEffect(() => {
    if (!draftReady.current) return
    void chrome.storage.local.set({ [DRAFT_KEY]: { seeds, keywords, reels, mode } })
  }, [seeds, keywords, reels, mode])

  useEffect(() => {
    if (keywordsEdited || keywordsHydrated.current) return
    const next = snowJob?.keywords?.join('\n')
    if (!next) return
    keywordsHydrated.current = true
    setKeywords(next)
  }, [snowJob, keywordsEdited])

  const activeJob = mode === 'batch' ? batchJob : snowJob
  const running = activeJob?.status === 'running'
  const paused = activeJob?.status === 'paused'
  const groups = useMemo(() => {
    if (mode === 'batch' && batchJob) {
      return batchJob.accounts.filter((account) => account.reels.length > 0).map((account) => ({
        username: account.username,
        followers: account.followers,
        reels: account.reels,
      }))
    }
    if (snowJob) {
      return snowJob.accounts
        .filter((account) => (account.reels?.length ?? 0) > 0)
        .map((account) => ({
          username: account.username,
          followers: account.followers,
          reels: account.reels ?? [],
          provenance: account.provenance,
        }))
    }
    return []
  }, [mode, batchJob, snowJob])
  const allRows = useMemo(() => researchRows(groups), [groups])
  const rows = useMemo(() => orderResearchRows(allRows, sort, !showPaid), [allRows, sort, showPaid])
  const paidHidden = showPaid ? 0 : allRows.filter((row) => row.likelyPaid).length
  const jobAlert = problemNote(activeJob?.note, activeJob?.status)
  const progress = progressFor(mode, batchJob, batchProgress, snowJob, snowProgress, snap.phase.type === 'collecting' ? snap.phase.label : '')

  async function run() {
    setAlert('')
    setStatus('')
    const handles = parseHandles(seeds)
    const terms = parseKeywords(keywords)
    if (mode === 'batch' && handles.length === 0) {
      setAlert('Paste at least one Instagram handle.')
      return
    }
    if (mode === 'snowball' && handles.length === 0 && terms.length === 0) {
      setAlert('Paste a seed handle or a keyword.')
      return
    }
    const typedReels = Number(reels)
    const batchCount = clampReels(reels.trim() === '' || !Number.isFinite(typedReels) ? DEFAULT_REELS : typedReels)
    const snowCount = reels.trim() === '' || !Number.isFinite(typedReels) ? DEFAULT_SNOWBALL_REELS : typedReels
    if (mode === 'batch') {
      if (snowJob?.status === 'running') {
        setAlert('Pause the snowball before running a batch.')
        return
      }
      const url = await queueBatch(handles, batchCount, DEFAULT_DELAY_MS)
      const here = location.pathname.replace(/\/+$/, '')
      if (here.toLowerCase() === `/${handles[0]}/reels`.toLowerCase()) kickBatch()
      else location.assign(url)
      return
    }
    if (batchJob?.status === 'running') {
      setAlert('Pause the batch before running a snowball.')
      return
    }
    const picked = handles.slice(0, 20)
    const job = createSnowball(
      picked,
      { reelsPerAccount: Math.min(MAX_SNOWBALL_REELS, Math.max(1, Math.round(snowCount))), delayMs: DEFAULT_DELAY_MS },
      Date.now(),
      terms,
    )
    await chrome.storage.local.set({ [SNOWBALL_KEY]: job, [SNOWBALL_PROGRESS_KEY]: progressLabel(job) })
    const trimmed: string[] = []
    if (picked.length < handles.length) trimmed.push('the first 20 handles')
    const typedKeywords = keywords.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean)
    if (typedKeywords.length > terms.length) trimmed.push('the first 10 keywords')
    if (trimmed.length > 0) setStatus(`Using ${trimmed.join(' and ')}.`)
    if (terms.length > 0 || !picked[0]) {
      void resumeSnowballRun()
      return
    }
    const surface = location.pathname.toLowerCase()
    if (surface.includes(`/${picked[0].toLowerCase()}/reels`)) void resumeSnowballRun()
    else location.assign(reelsUrl(picked[0]))
  }

  async function pause() {
    setAlert('')
    if (batchJob?.status === 'running') await markPaused('Paused.')
    if (snowJob?.status === 'running') await markSnowballPaused('Paused.')
    stopCollect()
  }

  async function resume() {
    setAlert('')
    setStatus('')
    if (mode === 'snowball') {
      const job = await markSnowballResumed()
      if (!job || job.status === 'done') {
        setAlert('No paused snowball to resume.')
        return
      }
      const planned = plan(job)
      const next = planned.step.type === 'score' ? planned.step.username : undefined
      if (next && !location.pathname.toLowerCase().includes(`/${next.toLowerCase()}/reels`)) {
        location.assign(reelsUrl(next))
        return
      }
      void resumeSnowballRun()
      return
    }
    const job = await markResumed()
    if (!job || job.status === 'done') {
      setAlert('No paused batch to resume.')
      return
    }
    const handle = job.handles[job.index]
    if (handle && !location.pathname.toLowerCase().includes(`/${handle.toLowerCase()}/reels`)) {
      location.assign(reelsUrl(handle))
      return
    }
    void resumeBatch()
  }

  async function exportRows() {
    if (rows.length === 0) {
      setAlert('No reels to export. Paid reels are hidden until you show them.')
      return
    }
    setBusy('export')
    setAlert('')
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const bytes = new Uint8Array(
        await buildWorkbook([
          { name: 'Reels', rows: researchReelTable(rows) },
          { name: 'Accounts', rows: batchSummaryTable(researchSummaries(rows)) },
        ]),
      )
      const response = (await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_BYTES',
        filename: downloadName(`${safeSegment(`research-${stamp}`)}.xlsx`),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: bytesToBase64(bytes),
      })) as { ok?: boolean; error?: string } | undefined
      if (!response?.ok) setAlert(response?.error || 'Chrome did not save the export.')
      else setStatus(`Exported ${rows.length} reels.`)
    } catch (error) {
      setAlert(error instanceof Error ? error.message : 'Could not export.')
    } finally {
      setBusy('')
    }
  }

  async function downloadTop() {
    const posts = rows.slice(0, TOP_DOWNLOAD).map((row) => row.post)
    if (posts.length === 0) {
      setAlert('No reels to download. Paid reels are hidden until you show them.')
      return
    }
    setBusy('download')
    setAlert('')
    setStatus('')
    try {
      await downloadRanked({ kind: 'reels', username: 'research' }, posts)
      setStatus(`Queued the top ${posts.length} videos.`)
    } catch (error) {
      setAlert(error instanceof Error ? error.message : 'Could not download those videos.')
    } finally {
      setBusy('')
    }
  }

  async function syncRows() {
    if (rows.length === 0) {
      setAlert('No reels to sync. Paid reels are hidden until you show them.')
      return
    }
    setBusy('sync')
    setAlert('')
    setStatus('')
    try {
      const stored = await chrome.storage.local.get(SYNC_KEY)
      const sync = cleanSync(stored[SYNC_KEY] as Partial<SyncSettings> | undefined)
      if (!sync.sheets && !notionReady(sync)) {
        setAlert('Turn on Google Sheets or Notion in the extension options, then sync again.')
        return
      }
      const summaries = researchSummaries(rows)
      const notes: string[] = []
      if (sync.sheets) {
        const sheet = (await chrome.runtime.sendMessage({
          type: 'CREATE_SHEET',
          title: `Research ${new Date().toISOString().slice(0, 10)}`,
          csv: tableToCsv(researchReelTable(rows)),
        })) as { ok?: boolean; error?: string } | undefined
        notes.push(sheet?.ok ? 'Opened a Google Sheet.' : `Sheets: ${sheet?.error || 'could not create the sheet.'}`)
      }
      if (notionReady(sync)) {
        const payload: SummarySyncRow[] = summaries.map((summary) => {
          const account = snowJob?.accounts.find((item) => item.username.toLowerCase() === summary.username.toLowerCase())
          return {
            account: summary.username,
            loaded: summary.loaded,
            medianViews: summary.medianViews,
            topReel: summary.topPermalink,
            topViews: summary.topViews,
            atLeast3x: summary.atLeast3x,
            followers: summary.followers,
            grade: account?.grade,
            note: account?.provenance,
          }
        })
        const notion = (await chrome.runtime.sendMessage({
          type: 'NOTION_SYNC',
          rows: payload,
          delayMs: DEFAULT_DELAY_MS,
        })) as { ok?: boolean; error?: string } | undefined
        notes.push(notion?.ok ? 'Sent the summary to Notion.' : `Notion: ${notion?.error || 'could not add the rows.'}`)
      }
      const failed = notes.filter((note) => note.startsWith('Sheets:') || note.startsWith('Notion:'))
      if (failed.length > 0) setAlert(notes.join(' '))
      else setStatus(notes.join(' '))
    } catch (error) {
      setAlert(error instanceof Error ? error.message : 'Could not sync.')
    } finally {
      setBusy('')
    }
  }

  if (!open) {
    return (
      <div className="research">
        <button type="button" className="primary" onClick={() => setOpen(true)}>
          Research{running ? ' · running' : paused ? ' · paused' : ''}
        </button>
      </div>
    )
  }

  return (
    <div className="research open">
      <div className="research-wrap">
        <button
          type="button"
          className="ghost research-close"
          onClick={() => {
            setOpen(false)
          }}
        >
          Close
        </button>
        <ResearchPanel
          seeds={seeds}
          onSeeds={(value) => {
            setEdited(true)
            setSeeds(value)
          }}
          keywords={keywords}
          onKeywords={(value) => {
            setKeywordsEdited(true)
            setKeywords(value)
          }}
          reels={reels}
          onReels={(value) => {
            setReels(value)
          }}
          reelsMax={mode === 'batch' ? 200 : MAX_SNOWBALL_REELS}
          debug={debug}
          mode={mode}
          onMode={(next) => {
            setMode((current) => {
              if (next === current) return current
              setReels((value) => {
                if (next === 'snowball' && value === String(DEFAULT_REELS)) return String(DEFAULT_SNOWBALL_REELS)
                if (next === 'batch' && value === String(DEFAULT_SNOWBALL_REELS)) return String(DEFAULT_REELS)
                return value
              })
              return next
            })
          }}
          running={Boolean(running)}
          paused={Boolean(paused)}
          progress={progress}
          alert={alert || jobAlert}
          status={status}
          rows={rows}
          shown={Math.min(rows.length, VISIBLE_CAP)}
          sort={sort}
          onSort={setSort}
          showPaid={showPaid}
          onShowPaid={setShowPaid}
          paidHidden={paidHidden}
          onRun={() => void run()}
          onPause={() => void pause()}
          onResume={() => void resume()}
          onExport={() => void exportRows()}
          onDownload={() => void downloadTop()}
          onSync={() => void syncRows()}
          busy={busy}
        />
      </div>
    </div>
  )
}

function progressFor(
  mode: ResearchMode,
  batchJob: BatchJob | null,
  batchProgress: BatchProgress | null,
  snowJob: SnowballJob | null,
  snowProgress: string,
  live: string,
): string {
  if (mode === 'batch') {
    if (!batchJob) return live
    const place = batchProgress && batchJob.status === 'running'
      ? `${batchProgress.index}/${batchProgress.total} @${batchProgress.handle} · ${batchProgress.collected} reels`
      : `${batchJob.index}/${batchJob.handles.length}`
    return [live, `Batch ${batchJob.status} · ${place}`].filter(Boolean).join(' · ')
  }
  if (!snowJob) return live
  return [live, `Snowball ${snowJob.status} · ${snowProgress || progressLabel(snowJob)}`].filter(Boolean).join(' · ')
}
