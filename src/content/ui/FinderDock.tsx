import { useEffect, useState, type SyntheticEvent } from 'react'
import { collectCandidates, exportCandidates, loadCandidates, sendCandidatesToBatch, DEFAULT_FOLLOWING } from '../finder'
import { DEFAULT_DELAY_MS, DEFAULT_REELS } from '../../lib/batch'
import type { Candidate } from '../../lib/candidates'

export function FinderDock({ username }: { username: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [chain, setChain] = useState(3)
  const [followingCap, setFollowingCap] = useState(DEFAULT_FOLLOWING)
  const [delayMs, setDelayMs] = useState(DEFAULT_DELAY_MS)
  const [added, setAdded] = useState<Candidate[]>([])
  const [known, setKnown] = useState(0)
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [report, setReport] = useState('')

  useEffect(() => {
    let live = true
    setAdded([])
    setError('')
    setReport('')
    void loadCandidates().then((all) => {
      if (!live) return
      setKnown(all.length)
    })
    return () => {
      live = false
    }
  }, [username])

  async function run() {
    setBusy(true)
    setOpen(true)
    setError('')
    setReport('')
    setLabel('Starting…')
    const controller = new AbortController()
    try {
      const result = await collectCandidates({
        username,
        chain,
        followingCap,
        scrollRounds: 0,
        delayMs,
        signal: controller.signal,
        onProgress: setLabel,
      })
      setAdded(result.added)
      setKnown(result.all.length)
      setError(result.error || '')
      if (result.added.length > 0) {
        setReport(`${result.added.length} new · ${result.all.length} saved on this browser`)
      } else if (!result.error) {
        setReport(`No suggested or following accounts came back for @${username}.`)
      } else if (result.all.length > 0) {
        setReport(`${result.all.length} saved earlier. This pass did not add any.`)
      } else {
        setReport('')
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not read accounts.'
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(message)
      setReport('')
    } finally {
      setBusy(false)
      setLabel('')
    }
  }

  const listed = added

  const isolate = (event: SyntheticEvent) => {
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
  }

  return (
    <div className="finder" onKeyDown={isolate} onKeyUp={isolate} onKeyPress={isolate} onMouseDown={isolate}>
      <button type="button" className="primary" onClick={() => (open ? setOpen(false) : void run())}>
        {busy ? 'Finding accounts…' : 'Find accounts'}
      </button>
      {open && (
        <div className="finder-panel">
          <p className="kicker">From @{username}</p>
          <p className="note">Reads suggested accounts and the following list. It does not follow, like, or message anyone.</p>
          <label>
            Suggested chain
            <input type="number" min={0} max={8} value={chain} onChange={(event) => setChain(Number(event.target.value))} />
          </label>
          <label>
            Following cap
            <input type="number" min={0} max={200} value={followingCap} onChange={(event) => setFollowingCap(Number(event.target.value))} />
          </label>
          <label>
            Delay (ms)
            <input type="number" min={400} max={10000} step={100} value={delayMs} onChange={(event) => setDelayMs(Number(event.target.value))} />
          </label>
          <button type="button" className="primary" disabled={busy} onClick={() => void run()}>
            {busy ? label || 'Reading…' : 'Collect'}
          </button>
          {busy && label && (
            <p className="note" role="status">
              {label}
            </p>
          )}
          {error && (
            <p className="finder-error" role="alert">
              {error}
            </p>
          )}
          {report && <p className="note">{report}</p>}
          {!busy && !error && !report && known > 0 && <p className="note">{known} accounts saved on this browser.</p>}
          {listed.length > 0 && (
            <>
              <ul>
                {listed.slice(0, 12).map((candidate) => (
                  <li key={`${candidate.source}-${candidate.username}`}>
                    @{candidate.username}
                    <span>
                      {' '}
                      {candidate.source}
                      {candidate.followers != null ? ` · ${candidate.followers}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {listed.length > 12 && <p className="note">{listed.length - 12} more are in the saved list.</p>}
              <div className="row">
                <button
                  type="button"
                  onClick={() => {
                    void exportCandidates(listed)
                      .then((message) => setReport(message))
                      .catch((exportError: unknown) => setError(exportError instanceof Error ? exportError.message : 'Export failed.'))
                  }}
                >
                  Export new
                </button>
                <button type="button" onClick={() => void sendCandidatesToBatch(listed, DEFAULT_REELS, delayMs)}>
                  Batch these
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
