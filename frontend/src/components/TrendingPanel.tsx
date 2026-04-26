import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { fetchTrending, type TrendingTopic } from '../services/api'
import './TrendingPanel.css'

type SummaryTab = 'general' | 'technical' | 'prediction'

const TABS: SummaryTab[] = ['general', 'technical', 'prediction']

function TrendingPanel() {
  const [topics, setTopics] = useState<TrendingTopic[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SummaryTab>('general')

  useEffect(() => {
    fetchTrending(10)
      .then((res) => setTopics(res.topics))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleExpand = (slug: string) => {
    if (expandedSlug === slug) {
      setExpandedSlug(null)
    } else {
      setExpandedSlug(slug)
      setActiveTab('general')
    }
  }

  const formatGrowth = (rate: number | null) => {
    if (rate === null) return '—'
    const pct = (rate * 100).toFixed(0)
    return rate > 0 ? `+${pct}%` : `${pct}%`
  }

  const getSummaryText = (topic: TrendingTopic, tab: SummaryTab) => {
    switch (tab) {
      case 'technical':
        return topic.summary_technical || 'No technical summary available.'
      case 'general':
        return topic.summary_general || 'No summary available.'
      case 'prediction':
        return topic.summary_prediction || 'No prediction available.'
    }
  }

  if (loading) {
    return (
      <div className="trending-panel">
        <p className="trending-status">Reading the latest issue…</p>
      </div>
    )
  }

  if (topics.length === 0) return null

  // Find the maximum absolute growth so we can size the spark bars meaningfully.
  const maxAbsGrowth = Math.max(
    ...topics.map((t) => Math.abs(t.growth_rate ?? 0)),
    0.01,
  )

  return (
    <ol className="trending-list">
      {topics.map((topic, i) => {
        const isExpanded = expandedSlug === topic.slug
        const growth = topic.growth_rate ?? 0
        const sparkPct = Math.min(100, (Math.abs(growth) / maxAbsGrowth) * 100)
        const isPositive = growth >= 0

        return (
          <motion.li
            key={topic.slug}
            className={'trending-item' + (isExpanded ? ' is-open' : '')}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              ease: [0.16, 1, 0.3, 1] as const,
              delay: 0.05 * i,
            }}
          >
            <button
              className="trending-row"
              onClick={() => toggleExpand(topic.slug)}
            >
              <span className="trending-num tabular">
                №{String(i + 1).padStart(2, '0')}
              </span>
              <span className="trending-label">{topic.label}</span>
              <span className="trending-spark" aria-hidden>
                <span
                  className={
                    'trending-spark-bar ' + (isPositive ? 'positive' : 'negative')
                  }
                  style={{ width: `${sparkPct}%` }}
                />
              </span>
              <span
                className={
                  'trending-growth tabular ' +
                  (isPositive ? 'positive' : 'negative')
                }
              >
                {formatGrowth(topic.growth_rate)}
              </span>
              <span className="trending-toggle" aria-hidden>
                {isExpanded ? '−' : '+'}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  key="summary"
                  className="trending-summary"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
                >
                  <div className="trending-summary-inner">
                    <div className="summary-tabs">
                      {TABS.map((tab) => (
                        <button
                          key={tab}
                          className={
                            'summary-tab' + (activeTab === tab ? ' active' : '')
                          }
                          onClick={() => setActiveTab(tab)}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                    <p className="summary-text">{getSummaryText(topic, activeTab)}</p>
                    {activeTab === 'prediction' && (
                      <p className="summary-disclaimer eyebrow">
                        AI-generated forecast · treat as a hypothesis
                      </p>
                    )}
                    <Link
                      to={`/topic/${topic.slug}`}
                      className="summary-link"
                    >
                      <span>Read the cluster</span>
                      <span aria-hidden>↗</span>
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        )
      })}
    </ol>
  )
}

export default TrendingPanel
