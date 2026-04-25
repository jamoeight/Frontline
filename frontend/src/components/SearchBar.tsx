import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { askQuery, type QueryAnswerResponse } from '../services/api'
import './SearchBar.css'

const ARXIV_CITE_RE = /\[arXiv:([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)\]/g

function renderAnswerWithCitations(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(ARXIV_CITE_RE)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start))
    }
    const arxivId = match[1]
    parts.push(
      <a
        key={`cite-${key++}`}
        href={`https://arxiv.org/abs/${arxivId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="cite-link"
      >
        [arXiv:{arxivId}]
      </a>,
    )
    lastIndex = start + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

function SearchBar() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<QueryAnswerResponse | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = question.trim()
    if (trimmed.length < 3) return

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await askQuery(trimmed)
      setResult(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get answer'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setQuestion('')
    setResult(null)
    setError(null)
  }

  const hasOutput = loading || error || result !== null

  return (
    <section className="search-bar">
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="search-input"
          placeholder="Ask a question about recent AI research..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
          maxLength={500}
        />
        <button
          type="submit"
          className="search-submit"
          disabled={loading || question.trim().length < 3}
        >
          {loading ? 'Searching...' : 'Ask'}
        </button>
        {hasOutput && (
          <button
            type="button"
            className="search-clear"
            onClick={handleClear}
            disabled={loading}
          >
            Clear
          </button>
        )}
      </form>

      {loading && (
        <div className="search-status">
          Embedding your question, matching to a topic, and generating an answer...
        </div>
      )}

      {error && !loading && (
        <div className="search-status error">Error: {error}</div>
      )}

      {result && !loading && !result.topic && (
        <div className="search-result no-match">
          <p>
            No topic cluster matched your question closely enough to give a
            reliable answer. Try rephrasing, or browse the trending topics
            below.
          </p>
        </div>
      )}

      {result && !loading && result.topic && (
        <div className="search-result">
          <header className="result-header">
            <div className="result-topic">
              <span className="result-label">Matched topic:</span>
              <Link to={`/topic/${result.topic.slug}`} className="result-topic-link">
                {result.topic.label}
              </Link>
            </div>
            <span className="confidence-badge">
              {(result.confidence * 100).toFixed(0)}% match
            </span>
          </header>

          {result.answer ? (
            <div className="result-answer">
              {renderAnswerWithCitations(result.answer)}
            </div>
          ) : (
            <p className="result-answer empty">
              No recent papers were found for this topic in the last 14 days.
            </p>
          )}

          {result.cited_papers.length > 0 && (
            <details className="result-sources">
              <summary>Sources ({result.cited_papers.length} papers)</summary>
              <ul>
                {result.cited_papers.slice(0, 10).map((p) => (
                  <li key={p.arxiv_id}>
                    <a
                      href={`https://arxiv.org/abs/${p.arxiv_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {p.title}
                    </a>
                    <span className="source-date">{p.publication_date}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="result-disclaimer">
            AI-generated answer based on recent paper abstracts. Verify claims
            against the cited sources.
          </p>
        </div>
      )}
    </section>
  )
}

export default SearchBar
