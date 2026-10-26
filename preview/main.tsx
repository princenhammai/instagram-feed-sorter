import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ResearchPanel } from '../src/content/ui/ResearchPanel'
import { orderResearchRows, researchRows, type ResearchSort } from '../src/lib/research-table'
import { compactReel } from '../src/lib/batch'
import { samplePost } from '../src/lib/sample'
import '../src/content/ui/overlay.css'

function reel(username: string, id: string, views: number, likes: number, caption: string) {
  return compactReel(
    samplePost({
      id,
      shortcode: id,
      username,
      views,
      likes,
      comments: 4,
      caption,
      url: `https://www.instagram.com/reel/${id}/`,
    }),
  )
}

const rows = orderResearchRows(
  researchRows([
    {
      username: 'ada',
      followers: 80_000,
      provenance: 'search: barber',
      reels: [
        reel('ada', 'a1', 10_000, 400, 'The first line is the hook'),
        reel('ada', 'a2', 10_000, 380, 'Another ordinary reel'),
        reel('ada', 'a3', 10_000, 420, 'A third ordinary reel'),
        reel('ada', 'breakout', 40_000, 1_600, 'This one cleared the median'),
        reel('ada', 'paid', 50_000, 2_000, 'Partner launch #ad'),
      ],
    },
    {
      username: 'bea',
      followers: 40_000,
      provenance: 'search: nail art',
      reels: [
        reel('bea', 'b1', 9_000, 800, 'Comments carried this one'),
        reel('bea', 'b2', 9_000, 200, 'Quiet reel'),
        reel('bea', 'b3', 9_000, 220, 'Third reel'),
      ],
    },
  ]),
  'median',
  true,
)

function Screen({ which }: { which: 'seed' | 'results' }) {
  const [sort, setSort] = useState<ResearchSort>('median')
  const [showPaid, setShowPaid] = useState(false)
  const visible = orderResearchRows(rows, sort, !showPaid)
  if (which === 'seed') {
    return (
      <div className="research open">
        <div className="research-wrap">
          <button type="button" className="ghost research-close">Close</button>
          <ResearchPanel
            seeds={'@ada\n@bea\nhttps://www.instagram.com/cara/'}
            onSeeds={() => undefined}
            keywords={'barber\nnail art'}
            onKeywords={() => undefined}
            reels="30"
            onReels={() => undefined}
            reelsMax={100}
            debug={['HTTP 200 /api/v1/clips/user/', 'HTTP 429 /api/v1/clips/user/ — feedback_required']}
            mode="snowball"
            onMode={() => undefined}
            running={false}
            paused
            progress="Snowball paused · Depth 1 · 5 STRONG · expanded 1/20 · 8/25 today"
            keywordAccounts="@ada, @bea"
            alert="Instagram asked us to slow down — wait at least a few hours"
            status=""
            grades={[
              { username: 'ada', grade: 'STRONG', depth: 0 },
              { username: 'bea', grade: 'MAYBE', depth: 0 },
              { username: 'cara', grade: 'WEAK', depth: 1 },
            ]}
            resumeLocked
            rows={visible}
            shown={0}
            sort="median"
            onSort={() => undefined}
            showPaid={false}
            onShowPaid={() => undefined}
            paidHidden={0}
            onRun={() => undefined}
            onPause={() => undefined}
            onResume={() => undefined}
            onExport={() => undefined}
            onDownload={() => undefined}
            onSync={() => undefined}
            busy=""
          />
        </div>
      </div>
    )
  }
  return (
    <div className="research open">
      <div className="research-wrap">
        <button type="button" className="ghost research-close">Close</button>
        <ResearchPanel
          seeds={'@ada\n@bea'}
          onSeeds={() => undefined}
          reels="100"
          onReels={() => undefined}
          debug={['HTTP 200 /api/v1/feed/user/1/?count=12']}
          mode="batch"
          onMode={() => undefined}
          running={false}
          paused={false}
          progress="Batch done · 2/2"
          alert=""
          status=""
          rows={visible}
          shown={visible.length}
          sort={sort}
          onSort={setSort}
          showPaid={showPaid}
          onShowPaid={setShowPaid}
          paidHidden={showPaid ? 0 : 1}
          onRun={() => undefined}
          onPause={() => undefined}
          onResume={() => undefined}
          onExport={() => undefined}
          onDownload={() => undefined}
          onSync={() => undefined}
          busy=""
        />
      </div>
    </div>
  )
}

const which = new URLSearchParams(location.search).get('view') === 'results' ? 'results' : 'seed'
document.body.style.margin = '0'
document.body.style.background = '#0e1116'
document.body.style.minHeight = '100vh'
createRoot(document.getElementById('root')!).render(
  <div className="layer" style={{ minHeight: '100vh' }}>
    <Screen which={which} />
  </div>,
)
