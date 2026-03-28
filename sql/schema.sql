-- Frontline Database Schema
-- PostgreSQL 16 + pgvector

CREATE EXTENSION IF NOT EXISTS vector;

-- Created first because topics references it via FK
CREATE TABLE pipeline_runs (
    id                  SERIAL          PRIMARY KEY,
    run_type            VARCHAR(30)     NOT NULL CHECK (run_type IN ('ingest', 'embed', 'cluster', 'summarize', 'metrics')),
    status              VARCHAR(20)     NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    paper_count         INTEGER         DEFAULT 0,
    processing_time_ms  INTEGER,
    error_message       TEXT,
    started_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_pipeline_runs_started ON pipeline_runs (started_at DESC);

CREATE TABLE papers (
    id                  BIGSERIAL       PRIMARY KEY,
    arxiv_id            VARCHAR(20)     NOT NULL UNIQUE,
    title               TEXT            NOT NULL,
    authors             JSONB           NOT NULL,           -- ["Alice", "Bob"]
    abstract            TEXT            NOT NULL,
    categories          TEXT[]          NOT NULL,           -- {'cs.AI','cs.LG'}
    publication_date    DATE            NOT NULL,
    embedding           vector(384),                        -- nullable until embedding pipeline runs
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_papers_publication_date ON papers (publication_date);
CREATE INDEX idx_papers_categories       ON papers USING GIN (categories);
CREATE INDEX idx_papers_created_at       ON papers (created_at);
CREATE INDEX idx_papers_embedding        ON papers USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE TABLE topics (
    id                      SERIAL          PRIMARY KEY,
    label                   VARCHAR(200)    NOT NULL,
    slug                    VARCHAR(200)    NOT NULL UNIQUE,
    summary_technical       TEXT,
    summary_general         TEXT,
    summary_prediction      TEXT,
    representative_terms    TEXT[]          NOT NULL DEFAULT '{}',
    paper_count             INTEGER         NOT NULL DEFAULT 0,
    cluster_run_id          INTEGER         REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TABLE paper_topics (
    paper_id            BIGINT          NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    topic_id            INTEGER         NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    relevance_score     REAL            NOT NULL CHECK (relevance_score >= 0 AND relevance_score <= 1),
    assigned_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),
    PRIMARY KEY (paper_id, topic_id)
);

CREATE INDEX idx_paper_topics_topic_relevance ON paper_topics (topic_id, relevance_score DESC);

CREATE TABLE trend_metrics (
    id                  BIGSERIAL       PRIMARY KEY,
    topic_id            INTEGER         NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    metric_date         DATE            NOT NULL,
    period              VARCHAR(10)     NOT NULL CHECK (period IN ('daily', 'weekly')),
    paper_count         INTEGER         NOT NULL DEFAULT 0,
    growth_rate         REAL,           -- week-over-week % change (nullable for first data point)
    acceleration        REAL,           -- rate of change of growth_rate
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (topic_id, metric_date, period)
);

CREATE INDEX idx_trend_metrics_date ON trend_metrics (metric_date);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_papers_updated_at
    BEFORE UPDATE ON papers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_topics_updated_at
    BEFORE UPDATE ON topics
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
