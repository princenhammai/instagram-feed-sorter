import { useState } from 'react'
import { collectCandidates, exportCandidates, loadCandidates, sendCandidatesToBatch, DEFAULT_FOLLOWING } from '../finder'
import { DEFAULT_DELAY_MS, DEFAULT_REELS } from '../../lib/batch'
import { notify } from '../store'
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

  async function run() {
    setBusy(true)
    setLabel('Starting…')
    const controller = new AbortController()
    try {
      const result = await collectCandidates({
        username,
        chain,
        followingCap,
        scrollRounds: 4,
        delayMs,
        signal: controller.signal,
        onProgress: setLabel,
      })
      setAdded(result.added)
      setKnown(result.all.length)
      notify(result.added.length === 0 ? 'No new accounts. The saved list already had these.' : `Added ${result.added.length} accounts.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not read accounts.')
    } finally {
      setBusy(false)
      setLabel('')
    }
  }

  return (
    <div className="finder">
      <button type="button" className="primary" onClick={() => setOpen((value) => !value)}>
        Find accounts
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
          {added.length > 0 && (
            <>
              <p className="note">{added.length} new · {known} saved on this browser</p>
              <ul>
                {added.slice(0, 8).map((candidate) => (
                  <li key={candidate.username}>
                    @{candidate.username}
                    <span> {candidate.source}{candidate.followers != null ? ` · ${candidate.followers}` : ''}</span>
                  </li>
                ))}
              </ul>
              <div className="row">
                <button
                  type="button"
                  onClick={() => {
                    void exportCandidates(added).then(notify).catch((error: unknown) => notify(error instanceof Error ? error.message : 'Export failed.'))
                  }}
                >
                  Export new
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void loadCandidates().then((all) => sendCandidatesToBatch(added.length > 0 ? added : all, DEFAULT_REELS, delayMs))
                  }}
                >
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
