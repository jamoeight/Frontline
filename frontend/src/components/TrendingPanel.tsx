import { useEffect, useState } from 'react'
import { fetchTrending, type TrendingTopic } from '../services/api'
import './TrendingPanel.css'

type SummaryTab = 'technical' | 'general' | 'prediction'

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
    if (rate === null) return 'N/A'
    const pct = (rate * 100).toFixed(1)
    return rate > 0 ? `+${pct}%` : `${pct}%`
  }

  const getSummaryText = (topic: TrendingTopic, tab: SummaryTab) => {
    switch (tab) {
      case 'technical': return topic.summary_technical || 'No technical summary available.'
      case 'general': return topic.summary_general || 'No summary available.'
      case 'prediction': return topic.summary_prediction || 'No prediction available.'
    }
  }

  if (loading) return <div className="trending-panel"><p className="status">Loading trending topics...</p></div>
  if (topics.length === 0) return null

  return (
    <div className="trending-panel">
      <h2>Trending Now</h2>
      <div className="trending-list">
        {topics.map((topic) => (
          <div key={topic.slug} className="trending-item">
            <button
              className="trending-header"
              onClick={() => toggleExpand(topic.slug)}
            >
              <span className="trending-label">{topic.label}</span>
              <span className={`growth-badge ${(topic.growth_rate ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatGrowth(topic.growth_rate)}
              </span>
            </button>

            {expandedSlug === topic.slug && (
              <div className="summary-card">
                <div className="summary-tabs">
                  {(['general', 'technical', 'prediction'] as SummaryTab[]).map((tab) => (
                    <button
                      key={tab}
                      className={activeTab === tab ? 'active' : ''}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="summary-content">
                  <p>{getSummaryText(topic, activeTab)}</p>
                  {activeTab === 'prediction' && (
                    <p className="disclaimer">Disclaimer: This prediction is AI-generated and may not be accurate.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default TrendingPanel
