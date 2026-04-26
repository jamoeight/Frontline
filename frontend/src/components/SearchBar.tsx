import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { askQuery, type QueryAnswerResponse } from '../services/api'
import './SearchBar.css'

const ARXIV_CITE_RE = /\[arXiv:([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)\]/g

const PROMPTS = [
  "What's new with diffusion models?",
  'How are LLMs being made smaller?',
  'Where is reinforcement learning headed?',
  "What's emerging in mechanistic interpretability?",
  'How are agents evaluated lately?',
  "What's changing in retrieval-augmented generation?",
  'How is mixture-of-experts evolving?',
  "What's the state of state-space models?",
  'How is in-context learning being explained?',
  'Where is alignment research moving?',
  "What's new in long-context attention?",
  'How are vision transformers improving?',
  "What's happening with text-to-3D?",
  'How is reasoning being benchmarked?',
  "What's emerging in chain-of-thought research?",
  'How is RLHF being extended or replaced?',
  "What's the latest on quantization?",
  'How are open-weight models closing the gap?',
  "What's new in autonomous coding agents?",
  'How is video generation advancing?',
  "What's happening with model merging?",
  'How are LLMs being grounded in tools?',
  "What's the state of multimodal foundation models?",
  'How is sparse attention being used?',
  "What's new in protein language models?",
  'How are diffusion samplers being sped up?',
  "What's emerging in 3D scene generation?",
  'How is curriculum learning being applied?',
  "What's happening with test-time compute?",
  'How are self-improving agents trained?',
  "What's the state of speech-to-speech models?",
  'How are LLMs being made more truthful?',
  "What's new in molecular generation?",
  'How is preference optimization changing?',
  "What's happening in LLM theorem proving?",
  'How are transformers being replaced?',
  "What's emerging in AI for science?",
  'How does data curation affect pretraining?',
  "What's the state of robotic foundation models?",
  'How are VLMs handling long videos?',
  "What's new in synthetic data for pretraining?",
  'How is constitutional AI evolving?',
  'How are agents handling long-horizon tasks?',
  "What's emerging in LLM red-teaming?",
  'How is image segmentation improving?',
  "What's new in LLM reasoning benchmarks?",
  'How are VLMs being aligned?',
  "What's the state of music generation?",
  'How are world models being trained?',
  "What's happening with continual pretraining?",
  'How is on-device inference improving?',
  "What's new in offline reinforcement learning?",
  'How are LLMs being made multilingual?',
  "What's emerging in graph neural networks?",
  'How are transformers handling tabular data?',
  "What's happening in neural compression?",
]

function shufflePrompts(): string[] {
  const arr = [...PROMPTS]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const TYPE_SPEED = 36
const DELETE_SPEED = 16
const HOLD_AT_END = 1700
const PAUSE_BETWEEN = 320
const INITIAL_DELAY = 600

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
        {arxivId}
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
  const [typed, setTyped] = useState('')
  const [armedPrompt, setArmedPrompt] = useState<string | null>(null)
  // Shuffle once on mount so each visitor sees a different ordering.
  const [prompts] = useState<string[]>(shufflePrompts)

  // Typing animation that cycles through PROMPTS while the input is empty.
  const isEmpty = question.length === 0 && !loading
  useEffect(() => {
    if (!isEmpty) {
      setTyped('')
      setArmedPrompt(null)
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    let promptIdx = 0
    let charIdx = 0
    let phase: 'typing' | 'holding' | 'deleting' = 'typing'

    const schedule = (fn: () => void, ms: number) => {
      timeoutId = setTimeout(() => {
        if (!cancelled) fn()
      }, ms)
    }

    const tick = () => {
      const current = prompts[promptIdx]

      if (phase === 'typing') {
        charIdx += 1
        setTyped(current.slice(0, charIdx))
        if (charIdx >= current.length) {
          phase = 'holding'
          setArmedPrompt(current)
          schedule(tick, HOLD_AT_END)
        } else {
          schedule(tick, TYPE_SPEED + Math.random() * 30)
        }
        return
      }

      if (phase === 'holding') {
        phase = 'deleting'
        setArmedPrompt(null)
        schedule(tick, PAUSE_BETWEEN)
        return
      }

      // deleting
      charIdx -= 1
      setTyped(current.slice(0, Math.max(0, charIdx)))
      if (charIdx <= 0) {
        promptIdx = (promptIdx + 1) % prompts.length
        phase = 'typing'
        schedule(tick, PAUSE_BETWEEN)
      } else {
        schedule(tick, DELETE_SPEED)
      }
    }

    schedule(tick, INITIAL_DELAY)
    return () => {
      cancelled = true
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }, [isEmpty, prompts])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = question.trim() || (armedPrompt ?? '').trim()
    if (trimmed.length < 3) return

    if (!question.trim() && armedPrompt) {
      setQuestion(armedPrompt)
    }

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

  return (
    <section className="search-bar">
      <form className="search-form" onSubmit={handleSubmit}>
        <div className="search-field">
          <span className="search-arrow" aria-hidden>→</span>
          <div className="search-input-wrap">
            <input
              type="text"
              className="search-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
              maxLength={500}
              aria-label="Research question"
              placeholder=""
            />
            {isEmpty && (
              <span className="search-ghost" aria-hidden>
                {typed}
                <span className="search-cursor">|</span>
              </span>
            )}
          </div>
        </div>
        <div className="search-actions">
          <button
            type="submit"
            className={'search-submit' + (armedPrompt && !question.trim() ? ' search-submit-armed' : '')}
            disabled={loading || (question.trim().length < 3 && !armedPrompt)}
          >
            <span>{loading ? 'Asking…' : 'Ask'}</span>
            <span className="search-submit-arrow" aria-hidden>↗</span>
          </button>
          {(loading || error || result) && (
            <button
              type="button"
              className="search-clear"
              onClick={handleClear}
              disabled={loading}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            className="search-status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
          >
            <span className="search-status-dots">
              <span /><span /><span />
            </span>
            <span>
              Embedding your question, locating its topic, and reading recent abstracts…
            </span>
          </motion.div>
        )}

        {error && !loading && (
          <motion.div
            key="error"
            className="search-status status-error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            Error: {error}
          </motion.div>
        )}

        {result && !loading && !result.topic && (
          <motion.div
            key="nomatch"
            className="search-result no-match"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
          >
            <span className="eyebrow">No clear match</span>
            <p>
              Your question didn't land close enough to any tracked topic for
              a reliable answer. Try a different angle, or browse the
              landscape below.
            </p>
          </motion.div>
        )}

        {result && !loading && result.topic && (
          <motion.article
            key="answer"
            className="search-result"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as const }}
          >
            <header className="result-header">
              <div className="result-topic">
                <span className="eyebrow">Matched topic</span>
                <Link to={`/topic/${result.topic.slug}`} className="result-topic-link">
                  {result.topic.label}
                  <span aria-hidden>↗</span>
                </Link>
              </div>
              <span className="confidence-meter tabular">
                <span className="confidence-bar">
                  <motion.span
                    className="confidence-bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, result.confidence * 100)}%` }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] as const, delay: 0.2 }}
                  />
                </span>
                <span className="confidence-value">
                  {(result.confidence * 100).toFixed(0)}%
                </span>
                <span className="confidence-label eyebrow">match</span>
              </span>
            </header>

            {result.answer ? (
              <p className="result-answer">
                {renderAnswerWithCitations(result.answer)}
              </p>
            ) : (
              <p className="result-answer empty">
                No recent papers were available for this topic in the last 14
                days.
              </p>
            )}

            {result.cited_papers.length > 0 && (
              <details className="result-sources">
                <summary>
                  <span className="eyebrow">Sources</span>
                  <span className="tabular">
                    {result.cited_papers.length} papers
                  </span>
                </summary>
                <ol>
                  {result.cited_papers.slice(0, 10).map((p) => (
                    <li key={p.arxiv_id}>
                      <a
                        href={`https://arxiv.org/abs/${p.arxiv_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="source-id tabular">
                          {p.arxiv_id}
                        </span>
                        <span className="source-title">{p.title}</span>
                      </a>
                      <span className="source-date tabular">
                        {p.publication_date}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            )}

            <p className="result-disclaimer">
              AI-generated, grounded in cited abstracts. Verify before quoting.
            </p>
          </motion.article>
        )}
      </AnimatePresence>
    </section>
  )
}

export default SearchBar
