import type { KeyboardEvent as ReactKeyboardEvent, SyntheticEvent } from 'react'
import { formatCount, formatMultiple, formatPercent } from '../../lib/format'
import { TOP_DOWNLOAD, VISIBLE_CAP, type ResearchMode, type ResearchRow, type ResearchSort } from '../../lib/research-table'

function isolate(event: SyntheticEvent) {
  event.stopPropagation()
  event.nativeEvent.stopImmediatePropagation()
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function keepFocus(event: SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) {
  event.stopPropagation()
  event.currentTarget.focus()
}

function blockNonDigits(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (event.key.length === 1 && !/\d/.test(event.key) && !event.ctrlKey && !event.metaKey) event.preventDefault()
}

export function ResearchPanel({
  seeds,
  onSeeds,
  keywords = '',
  onKeywords = () => undefined,
  reels = '100',
  onReels = () => undefined,
  reelsMax = 200,
  maxAccounts = '20',
  onMaxAccounts = () => undefined,
  maxDepth = '2',
  onMaxDepth = () => undefined,
  debug = [],
  mode,
  onMode,
  running,
  paused,
  progress,
  alert,
  status,
  rows,
  shown,
  sort,
  onSort,
  showPaid,
  onShowPaid,
  paidHidden,
  onRun,
  onPause,
  onResume,
  onExport,
  onDownload,
  onSync,
  busy,
}: {
  seeds: string
  onSeeds: (value: string) => void
  keywords?: string
  onKeywords?: (value: string) => void
  reels?: string
  onReels?: (value: string) => void
  reelsMax?: number
  maxAccounts?: string
  onMaxAccounts?: (value: string) => void
  maxDepth?: string
  onMaxDepth?: (value: string) => void
  debug?: string[]
  mode: ResearchMode
  onMode: (mode: ResearchMode) => void
  running: boolean
  paused: boolean
  progress: string
  alert: string
  status: string
  rows: ResearchRow[]
  shown: number
  sort: ResearchSort
  onSort: (sort: ResearchSort) => void
  showPaid: boolean
  onShowPaid: (value: boolean) => void
  paidHidden: number
  onRun: () => void
  onPause: () => void
  onResume: () => void
  onExport: () => void
  onDownload: () => void
  onSync: () => void
  busy: '' | 'export' | 'download' | 'sync'
}) {
  const visible = rows.slice(0, VISIBLE_CAP)
  return (
    <section
      className="research-panel"
      aria-label="Research"
      onKeyDown={isolate}
      onKeyUp={isolate}
      onKeyPress={isolate}
      onMouseDown={isolate}
    >
      <header className="research-head">
        <div>
          <p className="kicker">Research</p>
          <h2>Seed, run, review</h2>
        </div>
      </header>

      <label className="research-seeds">
        Seed handles
        <textarea
          id="ifs-seeds"
          value={seeds}
          rows={mode === 'snowball' ? 3 : 5}
          placeholder={'@ada\nhttps://www.instagram.com/bob/'}
          aria-label="Seed handles, one per line"
          onPointerDown={keepFocus}
          onChange={(event) => onSeeds(event.target.value)}
        />
      </label>
      {mode === 'snowball' && (
        <label className="research-seeds">
          Keywords
          <textarea
            id="ifs-keywords"
            value={keywords}
            rows={3}
            placeholder={'barber\nnail art'}
            aria-label="Keywords, one per line"
            onPointerDown={keepFocus}
            onChange={(event) => onKeywords(event.target.value)}
          />
        </label>
      )}

      <label className="research-count">
        Reels per account
        <input
          id="ifs-reels"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={3}
          value={digitsOnly(reels)}
          aria-label="Reels per account"
          onPointerDown={keepFocus}
          onKeyDown={blockNonDigits}
          onChange={(event) => {
            const digits = digitsOnly(event.target.value)
            if (!digits) {
              onReels('')
              return
            }
            onReels(String(Math.min(reelsMax, Number(digits))))
          }}
        />
      </label>
      {mode === 'snowball' && (
        <div className="research-caps">
          <label>
            Max accounts
            <input
              id="ifs-max-accounts"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              value={digitsOnly(maxAccounts)}
              aria-label="Max accounts"
              onPointerDown={keepFocus}
              onKeyDown={blockNonDigits}
              onChange={(event) => onMaxAccounts(digitsOnly(event.target.value))}
            />
          </label>
          <label>
            Max depth
            <input
              id="ifs-max-depth"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={1}
              value={digitsOnly(maxDepth)}
              aria-label="Max depth"
              onPointerDown={keepFocus}
              onKeyDown={blockNonDigits}
              onChange={(event) => onMaxDepth(digitsOnly(event.target.value))}
            />
          </label>
        </div>
      )}

      <div className="segment" role="group" aria-label="Run mode">
        <button type="button" aria-pressed={mode === 'batch'} onClick={() => onMode('batch')}>
          Batch
        </button>
        <button type="button" aria-pressed={mode === 'snowball'} onClick={() => onMode('snowball')}>
          Snowball
        </button>
      </div>
      <p className="note">
        {mode === 'batch'
          ? 'Reads each profile’s Reels grid the same way Sort does, 1.2s apart. A run that finds no reels stays paused instead of exporting an empty file. Only HTTP 429 or feedback_required pauses for rate limiting.'
          : 'Keywords open the search page and read the accounts it loads, up to 15 each, with provenance search: keyword. Max accounts is the STRONG target. Max depth is how far expansion goes.'}
      </p>

      <div className="row">
        {running ? (
          <button type="button" onClick={onPause}>
            Pause
          </button>
        ) : (
          <button type="button" className="primary" onClick={onRun}>
            Run
          </button>
        )}
        {paused && (
          <button type="button" className="primary" onClick={onResume}>
            Resume
          </button>
        )}
      </div>

      {progress && (
        <p className="research-progress" role="status">
          {progress}
        </p>
      )}
      {alert && (
        <p className="research-error" role="alert">
          {alert}
        </p>
      )}
      {status && !alert && <p className="research-ok">{status}</p>}

      <div className="research-log">
        <p className="kicker">Request log</p>
        <pre className="research-debug" aria-label="Request log">
          {debug.length === 0 ? 'No Instagram requests yet.' : debug.join('\n')}
        </pre>
      </div>

      <div className="research-results">
        <div className="spread">
          <p className="note">
            {rows.length === 0 ? 'No reels yet.' : `${rows.length} reels`}
            {shown < rows.length ? ` · showing ${shown}` : ''}
            {paidHidden > 0 ? ` · ${paidHidden} paid hidden` : ''}
          </p>
          <label className="check">
            <input type="checkbox" checked={showPaid} onChange={(event) => onShowPaid(event.target.checked)} />
            Show paid
          </label>
        </div>
        <div className="research-scroll">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Hook</th>
                <SortHeader label="Views" column="views" sort={sort} onSort={onSort} />
                <SortHeader label="× median" column="median" sort={sort} onSort={onSort} />
                <SortHeader label="Engagement" column="engagement" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    Run a batch or snowball. Paid reels stay hidden until you show them.
                  </td>
                </tr>
              )}
              {visible.map((row) => (
                <tr key={`${row.username}-${row.shortcode}`}>
                  <td>
                    @{row.username}
                    {row.provenance ? <span className="source">{row.provenance}</span> : null}
                  </td>
                  <td className="hook" title={row.hook}>
                    {row.hook || '—'}
                    {row.likelyPaid ? <span className="paid">Paid</span> : null}
                  </td>
                  <td>{formatCount(row.views)}</td>
                  <td>{row.medianScore == null ? '—' : formatMultiple(row.medianScore)}</td>
                  <td>{formatPercent(row.engagementRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="research-actions">
        <button type="button" className="primary" disabled={busy !== '' || rows.length === 0} onClick={onExport}>
          {busy === 'export' ? 'Exporting…' : 'Export'}
        </button>
        <button type="button" disabled={busy !== '' || rows.length === 0} onClick={onDownload}>
          {busy === 'download' ? 'Downloading…' : `Download top ${Math.min(TOP_DOWNLOAD, rows.length || TOP_DOWNLOAD)}`}
        </button>
        <button type="button" disabled={busy !== '' || rows.length === 0} onClick={onSync}>
          {busy === 'sync' ? 'Syncing…' : 'Sync'}
        </button>
      </div>
    </section>
  )
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: string
  column: ResearchSort
  sort: ResearchSort
  onSort: (sort: ResearchSort) => void
}) {
  const active = sort === column
  return (
    <th aria-sort={active ? 'descending' : 'none'}>
      <button type="button" className={active ? 'sort-on' : ''} onClick={() => onSort(column)}>
        {label}
      </button>
    </th>
  )
}
