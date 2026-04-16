import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchTopicPapers, type PaperItem, type TopicPapersResponse } from '../services/api'
import './TopicDetail.css'

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

  if (loading) return <div className="topic-detail"><p className="status">Loading...</p></div>
  if (error) return <div className="topic-detail"><p className="status error">Error: {error}</p></div>
  if (!data) return <div className="topic-detail"><p className="status">Topic not found</p></div>

  const filtered = filter
    ? data.papers.filter((p) =>
        p.title.toLowerCase().includes(filter.toLowerCase()) ||
        p.authors.some((a) => a.toLowerCase().includes(filter.toLowerCase())) ||
        p.categories.some((c) => c.toLowerCase().includes(filter.toLowerCase()))
      )
    : data.papers

  const displayed = filtered.slice(0, 10)

  return (
    <div className="topic-detail">
      <Link to="/" className="back-link">Back to Trend Explorer</Link>

      <header className="topic-header">
        <h1>{data.label}</h1>
        {data.summary_general && (
          <p className="topic-summary">{data.summary_general}</p>
        )}
      </header>

      <div className="paper-controls">
        <div className="paper-sort">
          <button
            className={sortBy === 'date' ? 'active' : ''}
            onClick={() => setSortBy('date')}
          >
            Newest
          </button>
          <button
            className={sortBy === 'relevance' ? 'active' : ''}
            onClick={() => setSortBy('relevance')}
          >
            Relevance
          </button>
        </div>
        <input
          type="text"
          className="paper-filter"
          placeholder="Filter papers..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="paper-count">
          {displayed.length} of {data.total_count} papers
        </span>
      </div>

      <table className="paper-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Authors</th>
            <th>Date</th>
            <th>Category</th>
            <th>Relevance</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((paper) => (
            <PaperRow key={paper.arxiv_id} paper={paper} />
          ))}
          {displayed.length === 0 && (
            <tr>
              <td colSpan={5} className="no-results">No papers match your filter.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function PaperRow({ paper }: { paper: PaperItem }) {
  return (
    <tr>
      <td>
        <a
          href={`https://arxiv.org/pdf/${paper.arxiv_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="paper-link"
        >
          {paper.title}
        </a>
      </td>
      <td className="authors">{paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ' et al.' : ''}</td>
      <td className="date">{paper.publication_date}</td>
      <td className="category">{paper.categories[0] || ''}</td>
      <td className="relevance">{(paper.relevance_score * 100).toFixed(0)}%</td>
    </tr>
  )
}

export default TopicDetail
