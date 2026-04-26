import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { fetchTopicPapers, type PaperItem, type TopicPapersResponse } from '../services/api'
import './TopicDetail.css'

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const, delay: i * 0.1 },
  }),
}

function TopicDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<TopicPapersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'relevance'>('date')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    fetchTopicPapers(slug, { limit: 100, sort_by: sortBy })
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load papers'))
      .finally(() => setLoading(false))
  }, [slug, sortBy])

  const filtered = useMemo(() => {
    if (!data) return []
    if (!filter) return data.papers
    const q = filter.toLowerCase()
    return data.papers.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.authors.some((a) => a.toLowerCase().includes(q)) ||
        p.categories.some((c) => c.toLowerCase().includes(q)),
    )
  }, [data, filter])

  if (loading) {
    return (
      <div className="page topic-detail">
        <p className="topic-status">Reading the cluster…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page topic-detail">
        <Link to="/" className="back-link">← Back to the bulletin</Link>
        <p className="topic-status status-error">Error: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="page topic-detail">
        <Link to="/" className="back-link">← Back to the bulletin</Link>
        <p className="topic-status">Topic not found.</p>
      </div>
    )
  }

  return (
    <div className="page topic-detail">
      <Link to="/" className="back-link">← Back to the bulletin</Link>

      <motion.header
        className="topic-header"
        initial="hidden"
        animate="show"
        variants={fade}
        custom={0}
      >
        <p className="topic-eyebrow eyebrow tabular">
          The cluster · {data.papers.length} of {data.total_count} papers shown
        </p>
        <motion.h1 className="topic-title" variants={fade} custom={1}>
          {data.label}.
        </motion.h1>

        {data.summary_general && (
          <motion.p className="topic-deck" variants={fade} custom={2}>
            <span className="dropcap">{data.summary_general.charAt(0)}</span>
            {data.summary_general.slice(1)}
          </motion.p>
        )}
      </motion.header>

      <motion.div
        className="topic-controls"
        initial="hidden"
        animate="show"
        variants={fade}
        custom={3}
      >
        <div className="control-cluster">
          <span className="control-label eyebrow">Sort</span>
          <div className="control-pills">
            <button
              className={'pill' + (sortBy === 'date' ? ' pill-active' : '')}
              onClick={() => setSortBy('date')}
            >
              Newest
            </button>
            <button
              className={'pill' + (sortBy === 'relevance' ? ' pill-active' : '')}
              onClick={() => setSortBy('relevance')}
            >
              Relevance
            </button>
          </div>
        </div>

        <div className="control-cluster control-cluster-grow">
          <span className="control-label eyebrow">Filter</span>
          <input
            type="text"
            className="filter-input"
            placeholder="Search title, authors, category…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="control-cluster">
          <span className="control-label eyebrow">Showing</span>
          <span className="control-count tabular">
            {filtered.length}{' '}
            <span className="control-count-total">of {data.papers.length}</span>
          </span>
        </div>
      </motion.div>

      <motion.section
        className="paper-list"
        initial="hidden"
        animate="show"
        variants={fade}
        custom={4}
      >
        {filtered.length === 0 ? (
          <p className="topic-status">Nothing matches your filter.</p>
        ) : (
          filtered.map((paper, i) => (
            <PaperRow key={paper.arxiv_id} paper={paper} index={i} />
          ))
        )}
      </motion.section>
    </div>
  )
}

function PaperRow({ paper, index }: { paper: PaperItem; index: number }) {
  return (
    <motion.article
      className="paper-row"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1] as const,
        delay: Math.min(0.4, index * 0.02),
      }}
    >
      <div className="paper-meta tabular">
        <span className="paper-num">№{String(index + 1).padStart(3, '0')}</span>
        <span className="paper-id">{paper.arxiv_id}</span>
        <span className="paper-date">{paper.publication_date}</span>
      </div>
      <a
        href={`https://arxiv.org/abs/${paper.arxiv_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="paper-title"
      >
        {paper.title}
      </a>
      <div className="paper-byline">
        <span className="paper-authors">
          {paper.authors.slice(0, 3).join(' · ')}
          {paper.authors.length > 3 ? ' et al.' : ''}
        </span>
        <span className="paper-cats">
          {paper.categories.slice(0, 3).map((c) => (
            <span key={c} className="paper-cat tabular">
              {c}
            </span>
          ))}
        </span>
        <span className="paper-relevance tabular">
          <span className="paper-relevance-label eyebrow">relevance</span>
          <span className="paper-relevance-value">
            {(paper.relevance_score * 100).toFixed(0)}%
          </span>
        </span>
      </div>
    </motion.article>
  )
}

export default TopicDetail
