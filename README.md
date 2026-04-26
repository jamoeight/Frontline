# Frontline

**AI research trend tracking dashboard.** Frontline ingests new arXiv papers
in six AI/ML categories every day, embeds each abstract, clusters papers
into emerging topics with BERTopic, computes week-over-week growth metrics,
generates LLM summaries, and serves everything through a FastAPI + React
dashboard. A natural-language search bar lets you ask questions in plain
English and get answers cited against recent papers.

---

## Table of contents

- [What it does](#what-it-does)
- [System architecture](#system-architecture)
- [Tech stack](#tech-stack)
- [Daily pipeline flow](#daily-pipeline-flow)
- [Search flow](#search-flow)
- [Database schema](#database-schema)
- [Project structure](#project-structure)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Running the system](#running-the-system)
- [Deployment](#deployment)
- [API reference](#api-reference)
- [Key conventions](#key-conventions)
- [Limitations](#limitations)

---

## What it does

Roughly 200–500 new AI/ML papers land on arXiv every day. Reading them all
is impossible; existing dashboards mostly show counts by hand-defined
category. Frontline instead:

1. **Pulls every new paper** in `cs.AI`, `cs.CL`, `cs.CV`, `cs.LG`, `cs.NE`,
   and `stat.ML` daily.
2. **Embeds the abstracts** with `all-MiniLM-L6-v2` (384-dim sentence
   transformer) so semantically similar papers end up close in vector
   space.
3. **Clusters them with BERTopic** to discover fine-grained research
   topics (e.g. "diffusion models", "instruction tuning") instead of relying
   on broad arXiv categories.
4. **Computes weekly growth and acceleration** for every topic.
5. **Generates three summaries per topic** via OpenRouter — technical,
   general, and a (clearly disclaimed) prediction.
6. **Surfaces the results** through a React dashboard with three chart
   modes (line, bubble, heatmap), a trending panel, a topic drill-down,
   and a natural-language search bar that answers questions with citations.

---

## System architecture

Three independent layers connected by a shared PostgreSQL database. Each
layer can be developed, deployed, and scaled separately.

```mermaid
flowchart LR
    subgraph External
        ARXIV[arXiv API]
        OR[OpenRouter API]
    end

    subgraph Pipeline["Pipeline (Python, runs daily via cron)"]
        INGEST[ingest.py] --> EMBED[embed.py]
        EMBED --> CLUSTER[cluster.py]
        CLUSTER --> METRICS[metrics.py]
        METRICS --> SUMMARIZE[summarize.py]
        SUMMARIZE --> CLEANUP[cleanup_old_data]
    end

    subgraph Storage
        DB[(PostgreSQL 16<br/>+ pgvector)]
    end

    subgraph API["Backend API (FastAPI + asyncpg)"]
        TRENDS[/api/trends/]
        TRENDING[/api/trending/]
        PAPERS[/api/topics/.../papers/]
        QUERY[/api/query/ask/]
    end

    subgraph UI["Frontend (React 19 + Vite)"]
        EXPLORER[Trend Explorer]
        DETAIL[Topic Detail]
        SEARCH[Search Bar]
        HELP[Help Page]
    end

    ARXIV --> INGEST
    OR --> SUMMARIZE
    OR --> QUERY
    Pipeline <--> DB
    DB <--> API
    API <--> UI
```

- The **pipeline** is the only writer. It runs once per day on the VPS and
  is idempotent (already-ingested papers are skipped, embeddings only
  generated for missing ones).
- The **backend** is read-only against the same database. Read endpoints
  use raw SQL via `text()` because the queries (LATERAL JOINs, window
  functions, CTEs) are simpler to express that way than through the ORM.
- The **frontend** is a static SPA built with Vite and proxied by nginx
  in production. It never talks to the database directly.

---

## Tech stack

| Layer | Technologies |
|-------|--------------|
| Pipeline | Python 3.11, `httpx`, `sentence-transformers` (`all-MiniLM-L6-v2`), `bertopic`, `hdbscan`, `scikit-learn` |
| Storage | PostgreSQL 16, [`pgvector`](https://github.com/pgvector/pgvector) (HNSW index, cosine distance) |
| Backend | FastAPI 0.115, SQLAlchemy 2.0 (async), `asyncpg`, `pydantic` v2, `pydantic-settings`, `httpx` (for OpenRouter) |
| LLM | OpenRouter API, default model `openai/gpt-oss-120b:free` |
| Frontend | React 19, TypeScript, Vite 8, React Router v7, Plotly.js (via factory wrapper), Axios |
| Deploy | systemd unit + nginx + crontab (see `deploy/`) |

Full pinned versions are in `requirements.txt` and `frontend/package.json`.

---

## Daily pipeline flow

The pipeline is orchestrated by `pipeline/ingest.py` and runs as a single
cron job. Each stage is also independently invokable
(`python -m pipeline.embed`, etc.) for re-running individual steps.

```mermaid
flowchart TD
    START([cron: 06:00 UTC daily]) --> FETCH[Query arXiv API<br/>for last 24h]
    FETCH -->|3s rate limit per page| PARSE[Parse Atom XML<br/>arxiv_id, title, abstract,<br/>authors, categories]
    PARSE --> INSERT[INSERT into papers<br/>skip duplicates by arxiv_id]
    INSERT --> EMBED[Load all-MiniLM-L6-v2<br/>encode papers WHERE<br/>embedding IS NULL]
    EMBED --> STORE_EMB[UPDATE papers<br/>SET embedding]
    STORE_EMB --> CLUSTER[Fit BERTopic + HDBSCAN<br/>on all paper embeddings]
    CLUSTER --> ASSIGN[Write topics +<br/>paper_topics rows]
    ASSIGN --> METRICS[Aggregate weekly counts<br/>compute growth_rate +<br/>acceleration]
    METRICS --> WRITE_METRICS[(UPSERT trend_metrics)]
    WRITE_METRICS --> SUMMARIZE[For each topic:<br/>fetch 30 recent abstracts,<br/>call OpenRouter LLM]
    SUMMARIZE --> WRITE_SUM[UPDATE topics<br/>SET summary_*]
    WRITE_SUM --> CLEANUP[DELETE papers older<br/>than 180 days +<br/>orphaned topics]
    CLEANUP --> LOG[INSERT pipeline_runs<br/>status=completed]
    LOG --> END([done])

    FETCH -.error.-> FAIL[INSERT pipeline_runs<br/>status=failed]
    EMBED -.error.-> FAIL
    CLUSTER -.error.-> FAIL
```

A typical run with ~300 new papers takes 3–6 minutes; the embedding step
dominates (sentence-transformer inference on CPU). Re-clustering is run
on the full surviving paper set every day, so emerging topics surface
automatically.

---

## Search flow

The natural-language search bar at the top of the dashboard maps a
plain-English question to one topic cluster and answers it using recent
abstracts as grounding context.

```mermaid
sequenceDiagram
    actor User
    participant UI as Frontend SearchBar
    participant API as POST /api/query/ask
    participant Embed as Sentence-Transformer<br/>(cached singleton)
    participant DB as PostgreSQL + pgvector
    participant LLM as OpenRouter

    User->>UI: types question, hits Ask
    UI->>API: { question }
    API->>Embed: encode(question)
    Embed-->>API: vector(384)
    API->>DB: SELECT top-50 nearest papers<br/>(p.embedding <=> :query)<br/>GROUP BY topic_id<br/>ORDER BY AVG(similarity) DESC
    DB-->>API: best topic + confidence

    alt confidence < 0.25
        API-->>UI: { topic: null, answer: null }
        UI-->>User: "no good match" message
    else confidence ≥ 0.25
        API->>DB: SELECT up to 60 recent abstracts<br/>WHERE topic_id = X<br/>AND publication_date >= now()-14d
        DB-->>API: list of {arxiv_id, title, abstract}
        API->>LLM: prompt(question, topic_label, abstracts)
        LLM-->>API: answer with [arXiv:XXXX.XXXXX] citations
        API-->>UI: { topic, answer, cited_papers, confidence }
        UI-->>User: rendered answer with linkified citations<br/>+ expandable Sources list<br/>+ AI disclaimer
    end
```

Two endpoints back this flow:

- **`POST /api/query/match`** — embed-and-match only. Useful for
  routing or as a building block.
- **`POST /api/query/ask`** — full pipeline including LLM call.

---

## Database schema

Five tables. `papers` is the base data, `topics` and `paper_topics` are
populated by clustering, `trend_metrics` is pre-aggregated for fast chart
queries, and `pipeline_runs` is an audit log.

```mermaid
erDiagram
    papers ||--o{ paper_topics : "assigned to"
    topics ||--o{ paper_topics : "contains"
    topics ||--o{ trend_metrics : "weekly counts"
    topics }o--|| pipeline_runs : "produced by"

    papers {
        bigint id PK
        varchar arxiv_id UK
        text title
        jsonb authors
        text abstract
        text_array categories
        date publication_date
        vector_384 embedding "HNSW cosine"
        timestamptz created_at
    }
    topics {
        int id PK
        varchar slug UK
        varchar label
        text summary_technical
        text summary_general
        text summary_prediction
        text_array representative_terms
        int paper_count
        int cluster_run_id FK
    }
    paper_topics {
        bigint paper_id FK
        int topic_id FK
        real relevance_score "0-1"
    }
    trend_metrics {
        bigserial id PK
        int topic_id FK
        date metric_date
        varchar period "daily | weekly"
        int paper_count
        real growth_rate "0.25 = 25%"
        real acceleration
    }
    pipeline_runs {
        serial id PK
        varchar run_type
        varchar status
        int paper_count
        int processing_time_ms
        text error_message
        timestamptz started_at
        timestamptz completed_at
    }
```

Full DDL (with HNSW index params, CHECK constraints, triggers) is in
[`sql/schema.sql`](sql/schema.sql).

---

## Project structure

```
Frontline/
├── backend/                  FastAPI application
│   ├── main.py               app factory, CORS, router registration
│   ├── config.py             pydantic-settings reading .env
│   ├── database.py           async engine + session factory
│   ├── routers/              one file per endpoint group
│   │   ├── trends.py         /api/trends, /api/trends/{slug}
│   │   ├── trending.py       /api/trending
│   │   ├── papers.py         /api/topics/{slug}/papers
│   │   └── query.py          /api/query/match, /api/query/ask
│   ├── schemas/              pydantic request/response models
│   ├── services/
│   │   ├── trend_service.py  read queries (LATERAL JOIN, CTEs)
│   │   ├── llm.py            OpenRouter integration
│   │   └── query_service.py  embed + topic match
│   └── models/orm.py         SQLAlchemy ORM (used by tools, not endpoints)
│
├── pipeline/                 daily ingest + processing
│   ├── ingest.py             orchestrator, arXiv fetch, cleanup
│   ├── embed.py              sentence-transformer encoding
│   ├── cluster.py            BERTopic + HDBSCAN, slugify
│   ├── metrics.py            weekly counts → growth → acceleration
│   └── summarize.py          per-topic LLM summaries
│
├── frontend/                 React + Vite SPA
│   ├── src/
│   │   ├── App.tsx           routes
│   │   ├── pages/
│   │   │   ├── TrendExplorer.tsx    home: charts + search + trending
│   │   │   ├── TopicDetail.tsx      paper drill-down
│   │   │   └── Help.tsx             how-it-works page
│   │   ├── components/
│   │   │   ├── Plot.tsx             react-plotly.js factory wrapper
│   │   │   ├── LineChart.tsx
│   │   │   ├── BubbleChart.tsx
│   │   │   ├── Heatmap.tsx
│   │   │   ├── TrendingPanel.tsx
│   │   │   └── SearchBar.tsx
│   │   ├── hooks/useTrends.ts
│   │   └── services/api.ts
│   └── vite.config.ts        proxies /api → :8000
│
├── sql/schema.sql            full PostgreSQL DDL
├── deploy/                   VPS deployment artifacts
│   ├── deploy.sh             pull + build + restart
│   ├── frontline-api.service systemd unit for uvicorn
│   ├── nginx-frontline.conf  reverse proxy + static SPA
│   └── ingest.cron           daily ingest schedule
├── requirements.txt          backend + pipeline pip deps
├── CLAUDE.md                 guidance for Claude Code sessions
└── README.md                 this file
```

---

## Local setup

### Prerequisites

- **Python 3.11** (the pipeline depends on `bertopic` + `hdbscan`; newer
  versions sometimes lag binary wheels for these)
- **Node.js 18+** and npm
- **PostgreSQL 16** with the `pgvector` extension installed

On Ubuntu / Debian:

```bash
sudo apt install postgresql-16 postgresql-16-pgvector
```

On macOS via Homebrew:

```bash
brew install postgresql@16 pgvector
```

### Clone and install

```bash
git clone https://github.com/jamoeight/Frontline.git
cd Frontline

# backend + pipeline deps
python -m venv .venv
source .venv/bin/activate     # on Windows Git Bash: source .venv/Scripts/activate
pip install -r requirements.txt

# frontend deps
cd frontend
npm install
cd ..
```

### Create the database

```bash
sudo -u postgres createdb frontline
sudo -u postgres psql -d frontline -f sql/schema.sql

# create an application user
sudo -u postgres psql -c "CREATE ROLE frontline LOGIN PASSWORD 'frontline_dev';"
sudo -u postgres psql -d frontline -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO frontline;"
sudo -u postgres psql -d frontline -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO frontline;"
```

---

## Environment variables

Create a `.env` file at the repo root:

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | yes | `postgresql+asyncpg://frontline:frontline_dev@localhost:5432/frontline` | Async connection used by FastAPI and the pipeline |
| `DATABASE_URL_SYNC` | for tooling | `postgresql+psycopg2://frontline:frontline_dev@localhost:5432/frontline` | Sync connection (Alembic, ad-hoc scripts) |
| `OPENROUTER_API_KEY` | yes for summaries / search | `""` | API key from [openrouter.ai](https://openrouter.ai). The pipeline and `/api/query/ask` will silently fail without one. |
| `OPENROUTER_MODEL` | no | `openai/gpt-oss-120b:free` | OpenRouter model slug |

Defaults assume local Postgres on the standard port. The connection
strings get parsed by `pydantic-settings` in `backend/config.py`.

---

## Running the system

### First-time data load

The dashboard needs at least a few weeks of papers and at least one
clustering run to be useful. Bootstrap by running the pipeline once:

```bash
python -m pipeline.ingest
```

This will fetch the last 24 hours of papers. To backfill more, edit the
date range in `pipeline/ingest.py:main()` (or run it daily for a few days
in a row) before standing up the cron job.

### Backend

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

- Health check: `curl http://localhost:8000/health` → `{"status":"ok"}`
- Interactive docs: <http://localhost:8000/docs>

### Frontend

```bash
cd frontend
npm run dev      # Vite dev server on :5173
```

Vite is configured to proxy `/api/*` requests to `localhost:8000`, so the
frontend talks to a real backend during development.

For type checking only (no build):

```bash
cd frontend
npx tsc --noEmit
```

### Pipeline (standalone stages)

Each pipeline stage can be run independently for re-processing:

```bash
python -m pipeline.ingest        # full pipeline (recommended)
python -m pipeline.embed         # only generate missing embeddings
python -m pipeline.cluster       # re-cluster everything (overwrites topics)
python -m pipeline.metrics       # recompute trend metrics
python -m pipeline.summarize     # regenerate LLM summaries
```

The BERTopic model is persisted to `pipeline/bertopic_model.pkl`
(gitignored).

---

## Deployment

The `deploy/` directory has the VPS deployment artifacts. The expected
layout:

```mermaid
flowchart TB
    USER([User browser]) -->|HTTPS| NGINX[nginx]
    NGINX -->|/| STATIC[/var/www/frontline<br/>static SPA bundle/]
    NGINX -->|/api/*| UVICORN[systemd: frontline-api<br/>uvicorn :8000]
    UVICORN --> PG[(PostgreSQL<br/>+ pgvector)]
    CRON[cron: 06:00 UTC] -->|python -m pipeline.ingest| PG
    CRON -->|httpx| ARXIV[arXiv API]
    CRON -->|httpx| OR[OpenRouter API]
```

### One-time VPS setup

1. Install Python, Node, PostgreSQL + pgvector, nginx.
2. Clone the repo to `/home/ubuntu/Frontline`.
3. Apply `sql/schema.sql` to a `frontline` database (see
   [Local setup](#local-setup)).
4. Drop the `.env` file in the repo root with production credentials.
5. Install the systemd unit and nginx config:

   ```bash
   sudo cp deploy/frontline-api.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now frontline-api

   sudo cp deploy/nginx-frontline.conf /etc/nginx/sites-available/frontline
   sudo ln -sf /etc/nginx/sites-available/frontline /etc/nginx/sites-enabled/frontline
   sudo nginx -t && sudo systemctl reload nginx
   ```

6. Install the cron job:

   ```bash
   crontab -u ubuntu deploy/ingest.cron
   ```

7. Build and deploy the frontend with `deploy/deploy.sh`.

### Subsequent deploys

```bash
ssh ubuntu@vps
cd Frontline
./deploy/deploy.sh
```

The script pulls latest, reinstalls deps, rebuilds the frontend, syncs
to `/var/www/frontline`, restarts the API, reloads nginx, and runs a
health check.

---

## API reference

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness check |
| `GET` | `/api/trends` | List topic trends. Query params: `window` (30/60/90), `mode` (`summary`/`timeseries`), `sort_by`, `limit` |
| `GET` | `/api/trends/{slug}` | Single topic detail with timeseries |
| `GET` | `/api/trending` | Fastest growing topics this week with summaries |
| `GET` | `/api/topics/{slug}/papers` | Papers in a topic. Query params: `limit`, `offset`, `sort_by` (`date`/`relevance`) |
| `POST` | `/api/query/match` | Embed a question and return the closest topic |
| `POST` | `/api/query/ask` | Match topic, retrieve recent abstracts, answer via LLM with citations |

Browseable schema is auto-generated at `/docs` (Swagger) and `/redoc`.

---

## Key conventions

- **Embeddings are 384-dimensional** (`all-MiniLM-L6-v2`). The
  `vector(384)` column type and HNSW index parameters
  (`m=16, ef_construction=200`) are hardcoded to this. Switching models
  requires a schema change and re-embed.
- **Growth rates are stored as floats**, not percentages: `0.25` = 25%
  growth. The frontend multiplies by 100 for display.
- **Topic slugs are the public identifier** in API URLs
  (`/api/topics/{slug}/papers`, `/api/trends/{slug}`). Slugs are
  derived from the BERTopic label in `pipeline/cluster.py`.
- **Read endpoints use raw SQL** via `text()`. ORM models exist for
  Alembic compatibility but aren't on the query path — the LATERAL
  JOINs and CTEs are simpler to express directly.
- **The pipeline is the only writer.** The backend is read-only against
  the same database.
- **arXiv's 3-second rate limit** is respected between paginated requests.
- **CORS is hardcoded** to `http://localhost:5173` in `backend/main.py`.
  In production, the frontend is served from the same origin so CORS
  doesn't apply.

---

## Limitations

- **arXiv only.** Conference proceedings, journals, and industry blog
  posts that never get a preprint are invisible to Frontline.
- **Six AI/ML categories.** Robotics (`cs.RO`), Information Retrieval
  (`cs.IR`), and other adjacent fields aren't ingested — cross-listed
  papers still appear if their primary category is in the watchlist.
- **180-day retention.** Older papers are purged. Long-term historical
  analysis isn't supported.
- **Cluster boundaries shift.** Re-clustering can split, merge, or
  rename topics as new papers arrive. A topic slug today may map to a
  slightly different cluster next week.
- **LLM summaries can hallucinate**, especially predictions. The Help
  page in the dashboard surfaces these caveats to users.
- **Single-node deployment.** The pipeline, API, and DB are designed to
  run on one VPS. Sharding would require more work than swapping a
  config flag.

---

## License

This project was built as a capstone for Lewis University.
