import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  fetchBriefing,
  type BriefingResponse,
  type CalibrationItem,
} from '../services/api'
import './Briefing.css'

const ISSUE_EPOCH = new Date('2023-01-01T00:00:00Z')

function issueNumber(d: Date): string {
  const days = Math.floor((d.getTime() - ISSUE_EPOCH.getTime()) / (1000 * 60 * 60 * 24))
  return String(days).padStart(4, '0')
}

function formatIssueDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase()
}

const fade = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1] as const,
      delay: i * 0.07,
    },
  }),
}

function TopicChip({ slug, label }: { slug: string; label: string }) {
  return (
    <Link to={`/topic/${slug}`} className="briefing-chip">
      <span>{label}</span>
      <span aria-hidden>↗</span>
    </Link>
  )
}

function verdictClass(v: string): string {
  const k = v.toLowerCase()
  if (k.startsWith('held')) return 'verdict-held'
  if (k.startsWith('partial')) return 'verdict-partial'
  if (k.startsWith('missed')) return 'verdict-missed'
  return 'verdict-unknown'
}

function CalibrationStat({ items }: { items: CalibrationItem[] }) {
  if (!items.length) return null
  const held = items.filter((i) => i.verdict.toLowerCase().startsWith('held')).length
  const partial = items.filter((i) => i.verdict.toLowerCase().startsWith('partial')).length
  const score = (held + 0.5 * partial) / items.length
  return (
    <div className="calibration-stat">
      <span className="calibration-stat-value tabular">
        {(score * 100).toFixed(0)}%
      </span>
      <span className="calibration-stat-label eyebrow">
        Last week's batting average · {held} held · {partial} partial · {items.length - held - partial} missed
      </span>
    </div>
  )
}

export default function Briefing() {
  const [data, setData] = useState<BriefingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBriefing()
      .then(setData)
      .catch((err) => {
        if (err?.response?.status === 404) {
          setError('No briefing has been generated yet. Run the pipeline once and check back.')
        } else {
          setError(err?.message || 'Failed to load briefing.')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const today = useMemo(() => new Date(), [])
  const issue = useMemo(() => issueNumber(today), [today])

  const labelFor = (slug: string): string =>
    data?.topic_labels?.[slug] ?? slug

  return (
    <div className="page bulletin briefing-page">
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
          <span className="masthead-tagline eyebrow">The Briefing — Weekly Synthesis</span>
        </div>
        <div className="masthead-right tabular">
          <span className="masthead-issue">
            <span className="eyebrow">Issue №</span>
            <span className="masthead-issue-number">{issue}</span>
          </span>
          <span className="masthead-date eyebrow">
            {data?.generated_on ? formatIssueDate(data.generated_on) : ''}
          </span>
          <Link to="/" className="masthead-help">
            <span>Back to the dashboard</span>
            <span aria-hidden>↗</span>
          </Link>
        </div>
      </motion.header>

      <hr className="rule masthead-rule" />

      {loading && <p className="status">Reading the wires…</p>}
      {error && <p className="status status-error">{error}</p>}

      {data && (
        <>
          {/* Lede */}
          <motion.section
            className="briefing-lede"
            initial="hidden"
            animate="show"
            variants={fade}
            custom={1}
          >
            <span className="eyebrow">The lede</span>
            <p className="briefing-lede-text">
              {data.sections.lede || 'No lede was generated.'}
            </p>
            <p className="briefing-lede-meta eyebrow">
              Synthesized by {data.model} · {data.sections.big_movements.length} movements ·{' '}
              {data.sections.emerging.length + data.sections.decelerating.length} flagged shifts
            </p>
          </motion.section>

          {/* Big Movements */}
          {data.sections.big_movements.length > 0 && (
            <motion.section
              className="section briefing-section"
              initial="hidden"
              animate="show"
              variants={fade}
              custom={2}
            >
              <header className="section-head">
                <span className="section-num eyebrow">§ I</span>
                <h2 className="section-title">The big movements</h2>
                <p className="section-deck">
                  Cross-cluster narratives — patterns spanning multiple topics, not single
                  hot clusters.
                </p>
              </header>
              <ol className="movements-list">
                {data.sections.big_movements.map((m, i) => (
                  <li key={i} className="movement">
                    <span className="movement-num tabular">№{String(i + 1).padStart(2, '0')}</span>
                    <div className="movement-body">
                      <h3 className="movement-title">{m.title}</h3>
                      <p className="movement-narrative">{m.narrative}</p>
                      {m.topic_slugs.length > 0 && (
                        <div className="movement-chips">
                          {m.topic_slugs.map((slug) => (
                            <TopicChip key={slug} slug={slug} label={labelFor(slug)} />
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </motion.section>
          )}

          {/* Emerging / Decelerating */}
          {(data.sections.emerging.length > 0 || data.sections.decelerating.length > 0) && (
            <motion.section
              className="section briefing-section"
              initial="hidden"
              animate="show"
              variants={fade}
              custom={3}
            >
              <header className="section-head">
                <span className="section-num eyebrow">§ II</span>
                <h2 className="section-title">Emerging &amp; cooling</h2>
                <p className="section-deck">
                  What's accelerating into view, and what's losing momentum, with one-line
                  reasons grounded in this week's data.
                </p>
              </header>
              <div className="shift-grid">
                <div className="shift-col">
                  <h3 className="shift-col-title eyebrow">Emerging</h3>
                  <ol className="shift-list">
                    {data.sections.emerging.map((n, i) => (
                      <li key={i} className="shift-item">
                        <Link to={`/topic/${n.slug}`} className="shift-link">
                          <span className="shift-label">{labelFor(n.slug)}</span>
                          <span className="shift-arrow positive" aria-hidden>↗</span>
                        </Link>
                        <p className="shift-why">{n.why}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="shift-col">
                  <h3 className="shift-col-title eyebrow">Decelerating</h3>
                  <ol className="shift-list">
                    {data.sections.decelerating.map((n, i) => (
                      <li key={i} className="shift-item">
                        <Link to={`/topic/${n.slug}`} className="shift-link">
                          <span className="shift-label">{labelFor(n.slug)}</span>
                          <span className="shift-arrow negative" aria-hidden>↘</span>
                        </Link>
                        <p className="shift-why">{n.why}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </motion.section>
          )}

          {/* Cross-Pollinations */}
          {data.sections.cross_pollinations.length > 0 && (
            <motion.section
              className="section briefing-section"
              initial="hidden"
              animate="show"
              variants={fade}
              custom={4}
            >
              <header className="section-head">
                <span className="section-num eyebrow">§ III</span>
                <h2 className="section-title">Cross-pollinations</h2>
                <p className="section-deck">
                  Pairs of clusters whose embedding centroids are converging — different
                  research communities arriving at related ideas.
                </p>
              </header>
              <ul className="pollinations-list">
                {data.sections.cross_pollinations.map((p, i) => (
                  <li key={i} className="pollination">
                    <div className="pollination-pair">
                      <Link to={`/topic/${p.topic_a_slug}`} className="pollination-side">
                        {labelFor(p.topic_a_slug)}
                      </Link>
                      <span className="pollination-glyph" aria-hidden>⇄</span>
                      <Link to={`/topic/${p.topic_b_slug}`} className="pollination-side">
                        {labelFor(p.topic_b_slug)}
                      </Link>
                    </div>
                    <p className="pollination-signal">{p.shared_signal}</p>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* Researcher's Dispatch */}
          {data.sections.researcher_dispatch.length > 0 && (
            <motion.section
              className="section briefing-section"
              initial="hidden"
              animate="show"
              variants={fade}
              custom={5}
            >
              <header className="section-head">
                <span className="section-num eyebrow">§ IV</span>
                <h2 className="section-title">The researcher's dispatch</h2>
                <p className="section-deck">
                  If you work on these areas, here's what else is worth a few minutes of
                  attention this week.
                </p>
              </header>
              <dl className="dispatch-list">
                {data.sections.researcher_dispatch.map((d, i) => (
                  <div key={i} className="dispatch-item">
                    <dt className="dispatch-area">
                      <span className="eyebrow">If you work on</span>
                      <span className="dispatch-area-name">{d.if_you_work_on}</span>
                    </dt>
                    <dd className="dispatch-watch">
                      <span className="eyebrow">Also watch</span>
                      <div className="dispatch-chips">
                        {d.also_watch_slugs.map((slug) => (
                          <TopicChip key={slug} slug={slug} label={labelFor(slug)} />
                        ))}
                      </div>
                      <p className="dispatch-reason">{d.reason}</p>
                    </dd>
                  </div>
                ))}
              </dl>
            </motion.section>
          )}

          {/* Open Questions */}
          {data.sections.open_questions.length > 0 && (
            <motion.section
              className="section briefing-section"
              initial="hidden"
              animate="show"
              variants={fade}
              custom={6}
            >
              <header className="section-head">
                <span className="section-num eyebrow">§ V</span>
                <h2 className="section-title">Open questions</h2>
                <p className="section-deck">
                  Questions the corpus surfaces — gaps, contradictions, things the field
                  has not yet answered.
                </p>
              </header>
              <ul className="questions-list">
                {data.sections.open_questions.map((q, i) => (
                  <li key={i} className="question">
                    <span className="question-num tabular">{String(i + 1).padStart(2, '0')}</span>
                    <span className="question-text">{q}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* Predictions */}
          {data.sections.predictions.length > 0 && (
            <motion.section
              className="section briefing-section"
              initial="hidden"
              animate="show"
              variants={fade}
              custom={7}
            >
              <header className="section-head">
                <span className="section-num eyebrow">§ VI</span>
                <h2 className="section-title">Predictions on the record</h2>
                <p className="section-deck">
                  Falsifiable claims about the next briefing. Graded next week.
                </p>
              </header>
              <ol className="predictions-list">
                {data.sections.predictions.map((p, i) => (
                  <li key={i} className="prediction">
                    <span className="prediction-num tabular">№{String(i + 1).padStart(2, '0')}</span>
                    <div className="prediction-body">
                      <p className="prediction-claim">{p.claim}</p>
                      <p className="prediction-meta eyebrow">
                        Testable by {p.testable_by || 'next briefing'}
                        {p.slugs.length > 0 && (
                          <>
                            {' · '}
                            {p.slugs.map((slug, j) => (
                              <span key={slug}>
                                {j > 0 ? ', ' : ''}
                                <Link to={`/topic/${slug}`} className="prediction-slug">
                                  {labelFor(slug)}
                                </Link>
                              </span>
                            ))}
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </motion.section>
          )}

          {/* Calibration */}
          {data.sections.calibration && data.sections.calibration.graded.length > 0 && (
            <motion.section
              className="section briefing-section"
              initial="hidden"
              animate="show"
              variants={fade}
              custom={8}
            >
              <header className="section-head">
                <span className="section-num eyebrow">§ VII</span>
                <h2 className="section-title">Calibration ledger</h2>
                <p className="section-deck">
                  How last week's predictions held up. We grade ourselves in public so the
                  briefing earns its trust over time.
                </p>
              </header>
              <CalibrationStat items={data.sections.calibration.graded} />
              <ol className="calibration-list">
                {data.sections.calibration.graded.map((c, i) => (
                  <li key={i} className="calibration-item">
                    <span className={'verdict-pill ' + verdictClass(c.verdict)}>
                      {c.verdict}
                    </span>
                    <div className="calibration-body">
                      <p className="calibration-claim">"{c.claim}"</p>
                      <p className="calibration-evidence">{c.evidence}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </motion.section>
          )}

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
                The Briefing · Generated {data.generated_on} · {data.model}
              </p>
              <p className="colophon-line eyebrow">
                Synthesized from arXiv embeddings &amp; cluster metrics — predictions are AI-generated
              </p>
            </div>
          </motion.footer>
        </>
      )}
    </div>
  )
}
