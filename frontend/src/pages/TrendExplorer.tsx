import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useTrends } from '../hooks/useTrends'
import LineChart from '../components/LineChart'
import BubbleChart from '../components/BubbleChart'
import Heatmap from '../components/Heatmap'
import TrendingPanel from '../components/TrendingPanel'
import SearchBar from '../components/SearchBar'
import {
  fetchStatus,
  fetchStats,
  fetchBriefing,
  type StatusResponse,
  type StatsResponse,
  type BriefingResponse,
} from '../services/api'
import './TrendExplorer.css'
import './Briefing.css'

type TimeWindow = 30 | 60 | 90
type ChartMode = 'bubble' | 'heatmap' | 'line'
type SortBy = 'growth_rate' | 'paper_count'

const ISSUE_EPOCH = new Date('2023-01-01T00:00:00Z')

function issueNumber(date: Date): string {
  const days = Math.floor((date.getTime() - ISSUE_EPOCH.getTime()) / (1000 * 60 * 60 * 24))
  return String(days).padStart(4, '0')
}

function formatIssueDate(date: Date): string {
  return date
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase()
}

function formatLastRun(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)

  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC'

  if (diffMin < 60) {
    if (diffMin < 1) return `Just now · ${time}`
    return `${diffMin} min ago · ${time}`
  }
  if (diffHr < 24 && d.toDateString() === now.toDateString()) {
    return `Today, ${time}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${time}`
  }
  const dateStr = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  return `${dateStr}, ${time}`
}

const fade = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1] as const,
      delay: i * 0.08,
    },
  }),
}

function TrendExplorer() {
  const [windowDays, setWindowDays] = useState<TimeWindow>(90)
  const [chartMode, setChartMode] = useState<ChartMode>('bubble')
  const [sortBy, setSortBy] = useState<SortBy>('growth_rate')
  const [limit, setLimit] = useState(10)
  const { topics, loading, error } = useTrends({ window: windowDays, sortBy, limit })

  const today = useMemo(() => new Date(), [])
  const issue = useMemo(() => issueNumber(today), [today])
  const issueDate = useMemo(() => formatIssueDate(today), [today])

  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [corpus, setCorpus] = useState<StatsResponse | null>(null)
  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {})
    fetchStats().then(setCorpus).catch(() => {})
  }, [])

  const [briefing, setBriefing] = useState<BriefingResponse | null>(null)
  useEffect(() => {
    fetchBriefing().then(setBriefing).catch(() => {})
  }, [])

  const stats = useMemo(() => {
    const growthRates = topics
      .map((t) => t.latest_growth_rate)
      .filter((g): g is number => g !== null && !Number.isNaN(g))
    const avgGrowth = growthRates.length
      ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length
      : 0
    const sorted = [...topics].sort(
      (a, b) => (b.latest_growth_rate ?? -Infinity) - (a.latest_growth_rate ?? -Infinity),
    )
    return {
      papers: corpus?.total_papers ?? 0,
      topics: corpus?.total_topics ?? 0,
      avgGrowth,
      biggestMover: sorted[0]?.label ?? null,
    }
  }, [topics, corpus])

  return (
    <div className="page bulletin">
      {/* Masthead */}
      <motion.header
        className="masthead"
        initial="hidden"
        animate="show"
        variants={fade}
        custom={0}
      >
        <div className="masthead-left">
          <Link to="/" className="wordmark">
            <span className="wordmark-mark">F</span>
            <span className="wordmark-text">Frontline</span>
          </Link>
          <span className="masthead-tagline eyebrow">The Daily AI Research Bulletin</span>
        </div>
        <div className="masthead-right tabular">
          <span className="masthead-issue">
            <span className="eyebrow">Issue №</span>
            <span className="masthead-issue-number">{issue}</span>
          </span>
          <span className="masthead-date eyebrow">{issueDate}</span>
          <Link to="/briefing" className="masthead-help">
            <span>The Briefing</span>
            <span aria-hidden>↗</span>
          </Link>
          <Link to="/help" className="masthead-help">
            <span>How this works</span>
            <span aria-hidden>↗</span>
          </Link>
        </div>
      </motion.header>

      <hr className="rule masthead-rule" />

      {/* Briefing teaser — appears only after a briefing has been generated */}
      {briefing && briefing.sections.lede && (
        <motion.aside
          className="briefing-teaser"
          initial="hidden"
          animate="show"
          variants={fade}
          custom={0.5}
        >
          <div>
            <span className="eyebrow briefing-teaser-eyebrow">The Briefing · {briefing.generated_on}</span>
            <p className="briefing-teaser-text">
              {briefing.sections.lede.length > 220
                ? briefing.sections.lede.slice(0, 220).trimEnd() + '…'
                : briefing.sections.lede}
            </p>
          </div>
          <Link to="/briefing" className="briefing-teaser-link">
            <span>Read the briefing</span>
            <span aria-hidden>↗</span>
          </Link>
        </motion.aside>
      )}

      {/* Hero */}
      <section className="hero">
        <motion.h1 className="hero-headline" initial="hidden" animate="show">
          <motion.span className="hero-line" variants={fade} custom={1}>
            What AI is
          </motion.span>
          <motion.span className="hero-line" variants={fade} custom={2}>
            working on,
          </motion.span>
          <motion.span className="hero-line hero-line-accent" variants={fade} custom={3}>
            right now.
          </motion.span>
        </motion.h1>

        <motion.aside
          className="hero-aside"
          initial="hidden"
          animate="show"
          variants={fade}
          custom={4}
        >
          <p className="hero-deck">
            A live, automated map of <em>arXiv</em> research — papers
            embedded, clustered into emerging topics, and ranked by what's
            growing fastest this week.
          </p>
          <dl className="hero-meta tabular">
            <div>
              <dt>Sources</dt>
              <dd>arXiv · cs.AI · cs.CL · cs.CV · cs.LG · cs.NE · stat.ML</dd>
            </div>
            <div>
              <dt>Last run</dt>
              <dd>
                <span className="hero-meta-primary">
                  {status?.last_ingest_at
                    ? formatLastRun(status.last_ingest_at)
                    : 'Awaiting first ingest'}
                </span>
                <span className="hero-meta-sub">
                  {status?.last_ingest_papers !== null && status?.last_ingest_papers !== undefined
                    ? `${status.last_ingest_papers.toLocaleString()} new papers · `
                    : ''}
                  Runs once a day · {status?.schedule ?? 'Daily at 06:00 UTC'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>Sentence-transformer embeddings + BERTopic / HDBSCAN</dd>
            </div>
          </dl>
        </motion.aside>
      </section>

      {/* Stats strip */}
      <motion.div
        className="stats-strip"
        initial="hidden"
        animate="show"
        variants={fade}
        custom={5}
      >
        <div className="stat">
          <span className="stat-value tabular">{stats.papers.toLocaleString()}</span>
          <span className="stat-label eyebrow">Papers tracked</span>
        </div>
        <div className="stat">
          <span className="stat-value tabular">{stats.topics}</span>
          <span className="stat-label eyebrow">Active topics</span>
        </div>
        <div className="stat">
          <span
            className={
              'stat-value tabular ' +
              (stats.avgGrowth >= 0 ? 'positive' : 'negative')
            }
          >
            {stats.avgGrowth >= 0 ? '+' : ''}
            {(stats.avgGrowth * 100).toFixed(1)}%
          </span>
          <span className="stat-label eyebrow">Avg week-over-week</span>
        </div>
        <div className="stat stat-wide">
          <span className="stat-value stat-value-text">
            {stats.biggestMover ?? '—'}
          </span>
          <span className="stat-label eyebrow">Biggest mover</span>
        </div>
      </motion.div>

      {/* Search */}
      <motion.section
        className="section section-search"
        initial="hidden"
        animate="show"
        variants={fade}
        custom={6}
      >
        <header className="section-head">
          <span className="section-num eyebrow">§ I</span>
          <h2 className="section-title">Ask a question.</h2>
          <p className="section-deck">
            Plain-English questions go through the same vector space as the
            papers. We match your question to a topic and answer with citations.
          </p>
        </header>
        <SearchBar />
      </motion.section>

      {/* Chart */}
      <motion.section
        className="section section-chart"
        initial="hidden"
        animate="show"
        variants={fade}
        custom={7}
      >
        <header className="section-head">
          <span className="section-num eyebrow">§ II</span>
          <h2 className="section-title">The landscape</h2>
          <p className="section-deck">
            Each topic is a cluster of semantically similar papers. Switch the
            view, the time window, or how topics are ranked.
          </p>
        </header>

        <div className="chart-controls">
          <ControlGroup label="View">
            {(['bubble', 'heatmap', 'line'] as ChartMode[]).map((m) => (
              <PillButton
                key={m}
                active={chartMode === m}
                onClick={() => setChartMode(m)}
              >
                {m}
              </PillButton>
            ))}
          </ControlGroup>
          <ControlGroup label="Window">
            {([30, 60, 90] as TimeWindow[]).map((w) => (
              <PillButton
                key={w}
                active={windowDays === w}
                onClick={() => setWindowDays(w)}
              >
                {w} days
              </PillButton>
            ))}
          </ControlGroup>
          <ControlGroup label="Rank by">
            <PillButton
              active={sortBy === 'growth_rate'}
              onClick={() => setSortBy('growth_rate')}
            >
              Growth
            </PillButton>
            <PillButton
              active={sortBy === 'paper_count'}
              onClick={() => setSortBy('paper_count')}
            >
              Volume
            </PillButton>
          </ControlGroup>
          <ControlGroup label="Show">
            {[5, 10, 20].map((n) => (
              <PillButton key={n} active={limit === n} onClick={() => setLimit(n)}>
                {n}
              </PillButton>
            ))}
          </ControlGroup>
        </div>

        <div className="chart-canvas">
          {loading && <p className="status">Reading the wires…</p>}
          {error && <p className="status status-error">Error: {error}</p>}
          {!loading && !error && topics.length === 0 && (
            <p className="status">No trend data has been collected yet.</p>
          )}
          {!loading && !error && topics.length > 0 && (
            <>
              {chartMode === 'bubble' && <BubbleChart topics={topics} />}
              {chartMode === 'heatmap' && <Heatmap topics={topics} />}
              {chartMode === 'line' && <LineChart topics={topics} />}
            </>
          )}
        </div>
      </motion.section>

      {/* Trending */}
      <motion.section
        className="section section-trending"
        initial="hidden"
        animate="show"
        variants={fade}
        custom={8}
      >
        <header className="section-head">
          <span className="section-num eyebrow">§ III</span>
          <h2 className="section-title">Top movers, this week</h2>
          <p className="section-deck">
            The fastest-growing topics by week-over-week paper count. Tap any
            row for the editor's notes and a link to the cluster.
          </p>
        </header>
        <TrendingPanel />
      </motion.section>

      {/* Colophon */}
      <motion.footer
        className="colophon"
        initial="hidden"
        animate="show"
        variants={fade}
        custom={9}
      >
        <hr className="rule" />
        <div className="colophon-row">
          <p className="colophon-line eyebrow">
            Frontline · Capstone · Lewis University · Issue №{issue}
          </p>
          <p className="colophon-line eyebrow">
            Built with FastAPI, BERTopic, pgvector, React. Set in Fraunces &amp; DM Sans.
          </p>
        </div>
      </motion.footer>
    </div>
  )
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="control-group">
      <span className="control-label eyebrow">{label}</span>
      <div className="control-pills">{children}</div>
    </div>
  )
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={'pill' + (active ? ' pill-active' : '')}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default TrendExplorer
