import { Link } from 'react-router-dom'
import './Help.css'

function Help() {
  return (
    <div className="help-page">
      <Link to="/" className="back-link">Back to Trend Explorer</Link>

      <header className="help-header">
        <h1>How Frontline Works</h1>
        <p className="lead">
          Frontline tracks AI research on arXiv and surfaces what's growing,
          what's slowing, and what new clusters of work are emerging. This
          page explains what's happening behind the scenes so you can
          interpret the dashboard with confidence.
        </p>
      </header>

      <nav className="help-toc">
        <a href="#overview">Overview</a>
        <a href="#data">Where the data comes from</a>
        <a href="#topics">How topics are discovered</a>
        <a href="#trends">How trend metrics are computed</a>
        <a href="#summaries">How summaries are generated</a>
        <a href="#search">How the search bar works</a>
        <a href="#glossary">Glossary</a>
        <a href="#limits">Limitations</a>
        <a href="#faq">FAQ</a>
      </nav>

      <section id="overview" className="help-section">
        <h2>Overview</h2>
        <p>
          Every day, a pipeline pulls new papers from arXiv, converts each
          abstract into a vector that captures its meaning, groups similar
          papers into <strong>topic clusters</strong>, computes
          week-over-week growth metrics, and asks a language model to
          summarize each cluster. The dashboard then visualizes which topics
          are accelerating and lets you ask questions in plain English.
        </p>
      </section>

      <section id="data" className="help-section">
        <h2>Where the data comes from</h2>
        <p>
          Papers are pulled from <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer">arXiv</a>'s
          public API across six categories that cover most active AI/ML
          research:
        </p>
        <ul className="cat-list">
          <li><code>cs.AI</code> — Artificial Intelligence</li>
          <li><code>cs.CL</code> — Computation and Language (NLP)</li>
          <li><code>cs.CV</code> — Computer Vision</li>
          <li><code>cs.LG</code> — Machine Learning</li>
          <li><code>cs.NE</code> — Neural and Evolutionary Computing</li>
          <li><code>stat.ML</code> — Statistics / Machine Learning</li>
        </ul>
        <p>
          The ingest job runs once per day and respects arXiv's 3-second
          rate limit between requests. Papers older than <strong>180 days</strong> are
          deleted to keep storage bounded; the trend windows on the
          dashboard (30 / 60 / 90 days) all sit comfortably inside that
          window.
        </p>
      </section>

      <section id="topics" className="help-section">
        <h2>How topics are discovered</h2>
        <p>
          Topics are <em>not</em> defined by arXiv's category labels — those
          are too broad ("Machine Learning" covers thousands of papers per
          month). Instead, Frontline discovers fine-grained topics by
          looking at what papers <em>actually say</em>:
        </p>
        <ol className="step-list">
          <li>
            <strong>Embed.</strong> Each paper's abstract is fed into the{' '}
            <code>all-MiniLM-L6-v2</code> sentence-transformer model, which
            produces a 384-dimensional vector. Papers with similar meaning
            end up close together in this vector space, even if they don't
            share the exact same words.
          </li>
          <li>
            <strong>Cluster.</strong> The vectors are passed to{' '}
            <a href="https://maartengr.github.io/BERTopic/" target="_blank" rel="noopener noreferrer">BERTopic</a>,
            which uses HDBSCAN to find dense clusters of papers and pulls
            keyword terms that distinguish each cluster from the others.
          </li>
          <li>
            <strong>Label.</strong> Each cluster gets a human-readable label
            derived from its top keywords (e.g. "diffusion models",
            "instruction tuning", "graph neural networks").
          </li>
        </ol>
        <p>
          A paper can belong to one topic. Re-clustering is run as part of
          the daily pipeline so newly emerging topics surface within a day
          of having enough papers to form a cluster.
        </p>
      </section>

      <section id="trends" className="help-section">
        <h2>How trend metrics are computed</h2>
        <p>
          For every topic, Frontline aggregates paper counts into weekly
          buckets and computes two metrics:
        </p>
        <dl className="metric-list">
          <dt>Growth rate</dt>
          <dd>
            Week-over-week percentage change in paper count. A growth rate
            of <code>0.25</code> means 25% more papers this week than last.
            Stored as a fraction; the dashboard multiplies by 100 for
            display.
          </dd>
          <dt>Acceleration</dt>
          <dd>
            The change in growth rate between consecutive weeks. Positive
            acceleration means a topic isn't just growing — it's growing
            faster. Negative acceleration means growth is slowing even if
            the topic is still expanding.
          </dd>
        </dl>
        <p>
          Both metrics are recomputed nightly and stored so charts load
          fast without re-aggregating raw paper counts on every request.
        </p>
      </section>

      <section id="summaries" className="help-section">
        <h2>How summaries are generated</h2>
        <p>
          Each topic gets three short summaries written by a large language
          model (currently <code>gpt-oss-120b</code> via OpenRouter):
        </p>
        <ul className="summary-types">
          <li>
            <strong>Technical</strong> — a 2–3 sentence summary aimed at
            researchers, mentioning specific methods or findings.
          </li>
          <li>
            <strong>General</strong> — a 2–3 sentence plain-language
            summary for non-experts.
          </li>
          <li>
            <strong>Prediction</strong> — a 2–3 sentence forecast of where
            the topic is heading. <em>This is AI-generated and may be
            wrong</em>; treat it as a starting point for your own thinking,
            not a fact.
          </li>
        </ul>
        <p>
          The model is given up to 30 of the topic's most recent abstracts
          as context. Summaries are regenerated when a topic's paper
          population changes meaningfully.
        </p>
      </section>

      <section id="search" className="help-section">
        <h2>How the search bar works</h2>
        <p>
          When you ask a question in the search bar at the top of the
          dashboard, Frontline runs a four-step process:
        </p>
        <ol className="step-list">
          <li>
            <strong>Embed.</strong> Your question is converted to a
            384-dimensional vector using the same model that embedded the
            papers, so they live in the same space.
          </li>
          <li>
            <strong>Match.</strong> A pgvector cosine-distance query finds
            the 50 papers nearest to your question, then groups them by
            topic and ranks topics by mean similarity. The top topic wins.
          </li>
          <li>
            <strong>Retrieve.</strong> Up to 60 of that topic's most
            recent abstracts (last 14 days, with fallback) are pulled as
            context.
          </li>
          <li>
            <strong>Answer.</strong> Your question + the abstracts are sent
            to the language model, which writes a 3–5 sentence answer
            citing specific papers in <code>[arXiv:XXXX.XXXXX]</code>{' '}
            format. Each citation in the rendered answer links to the
            paper on arXiv.
          </li>
        </ol>
        <p>
          If no topic clears a minimum confidence threshold, the search
          returns "no good match" rather than feeding the model unrelated
          context. The confidence percentage shown next to the matched
          topic is the mean cosine similarity of the matched papers.
        </p>
      </section>

      <section id="glossary" className="help-section">
        <h2>Glossary</h2>
        <dl className="glossary">
          <dt>Paper</dt>
          <dd>A single arXiv preprint, identified by its arXiv ID (e.g. <code>2501.12345</code>).</dd>

          <dt>Topic / cluster</dt>
          <dd>A group of semantically similar papers discovered automatically by BERTopic. Topics are not predefined — they're whatever the data forms.</dd>

          <dt>Embedding</dt>
          <dd>A 384-dimensional vector representing the meaning of a paper's abstract. Closer vectors → more similar meaning.</dd>

          <dt>Growth rate</dt>
          <dd>Week-over-week percentage change in a topic's paper count. <code>0.25</code> = 25% growth.</dd>

          <dt>Acceleration</dt>
          <dd>The change in growth rate. Positive = a topic is speeding up. Negative = slowing down even if still growing.</dd>

          <dt>Confidence (search)</dt>
          <dd>The mean cosine similarity between your question and the matched topic's papers. Higher = better match.</dd>

          <dt>Window</dt>
          <dd>The lookback period used by the trend explorer (30, 60, or 90 days).</dd>

          <dt>Time series</dt>
          <dd>The weekly history of paper counts and growth rate for a topic, plotted on the line and heatmap charts.</dd>
        </dl>
      </section>

      <section id="limits" className="help-section">
        <h2>Limitations</h2>
        <ul className="limit-list">
          <li>
            <strong>arXiv only.</strong> Conference papers, journal-only
            work, and industry papers that never get posted to arXiv are
            invisible to Frontline.
          </li>
          <li>
            <strong>Categories are AI-focused.</strong> Robotics
            (<code>cs.RO</code>), Information Retrieval (<code>cs.IR</code>),
            and other adjacent fields aren't ingested. Cross-listed papers
            still appear if their primary category is in the watchlist.
          </li>
          <li>
            <strong>180-day retention.</strong> Older papers are purged.
            Long-term historical analysis isn't supported.
          </li>
          <li>
            <strong>LLM summaries can hallucinate.</strong> Especially
            predictions. Always verify against the cited papers before
            quoting.
          </li>
          <li>
            <strong>Cluster boundaries shift.</strong> Re-clustering can
            split, merge, or rename topics as new papers arrive. A topic
            slug today may map to a slightly different cluster next week.
          </li>
        </ul>
      </section>

      <section id="faq" className="help-section">
        <h2>FAQ</h2>

        <h3>Why do I see fewer papers in a topic than the count says?</h3>
        <p>
          The topic detail page shows the most relevant 100 papers; the
          full count includes all papers ever assigned to that cluster
          within the 180-day window.
        </p>

        <h3>Why did a topic I was watching disappear?</h3>
        <p>
          Re-clustering can dissolve small topics into larger ones, or
          rename a topic if its keyword distribution shifted. The papers
          themselves don't disappear — they're now in whatever cluster
          best fits them.
        </p>

        <h3>How fresh is the data?</h3>
        <p>
          The ingest cron runs daily. Papers submitted to arXiv yesterday
          should appear in the dashboard within ~24 hours.
        </p>

        <h3>Can I trust the prediction summaries?</h3>
        <p>
          Treat them as a hypothesis, not a forecast. They're generated by
          an LLM looking at recent abstracts and may extrapolate beyond
          what the data supports. The technical and general summaries are
          more reliable because they describe what the papers
          <em> already </em>say.
        </p>

        <h3>What does "no good match" mean in the search bar?</h3>
        <p>
          Your question didn't land close enough to any topic cluster for
          the answer to be reliable. Try rephrasing with more specific
          terminology, or browse the topics directly via the bubble or
          line chart.
        </p>
      </section>
    </div>
  )
}

export default Help
