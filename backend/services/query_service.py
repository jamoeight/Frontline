"""
Query embedding and topic matching for natural language research questions.

Embeds a user's plain-English question with all-MiniLM-L6-v2 (the same
model used for paper abstracts) and finds the topic cluster whose papers
are most similar to the query in vector space.

Matching strategy: cosine-nearest top-K papers via pgvector, grouped by
topic, ranked by mean similarity. Confidence is the mean cosine similarity
of the winning topic's matched papers (range 0-1).
"""

from sentence_transformers import SentenceTransformer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

MODEL_NAME = "all-MiniLM-L6-v2"
TOP_K_PAPERS = 50
MIN_CONFIDENCE = 0.25

_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    """Lazy-load the embedding model on first call, cache for reuse."""
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed_query(question: str) -> list[float]:
    """Encode a question into a 384-dim vector."""
    model = get_model()
    embedding = model.encode([question], show_progress_bar=False)[0]
    return embedding.tolist()


async def match_topic(
    session: AsyncSession,
    query_embedding: list[float],
) -> tuple[dict | None, float, int]:
    """Find the topic whose papers are nearest to the query in vector space.

    Returns (topic_row | None, confidence, matched_paper_count). The topic
    is None if no topic clears MIN_CONFIDENCE — the caller can surface a
    "no good match" message instead of an irrelevant answer.
    """
    embedding_str = str(query_embedding)

    result = await session.execute(
        text("""
            WITH similar AS (
                SELECT pt.topic_id,
                       1 - (p.embedding <=> CAST(:query_emb AS vector)) AS similarity
                FROM papers p
                JOIN paper_topics pt ON pt.paper_id = p.id
                WHERE p.embedding IS NOT NULL
                ORDER BY p.embedding <=> CAST(:query_emb AS vector)
                LIMIT :top_k
            )
            SELECT t.id, t.slug, t.label, t.paper_count, t.summary_general,
                   AVG(s.similarity) AS avg_similarity,
                   COUNT(*) AS match_count
            FROM similar s
            JOIN topics t ON t.id = s.topic_id
            GROUP BY t.id, t.slug, t.label, t.paper_count, t.summary_general
            ORDER BY avg_similarity DESC, match_count DESC
            LIMIT 1
        """),
        {"query_emb": embedding_str, "top_k": TOP_K_PAPERS},
    )

    row = result.mappings().first()
    if row is None:
        return None, 0.0, 0

    confidence = float(row["avg_similarity"])
    match_count = int(row["match_count"])

    if confidence < MIN_CONFIDENCE:
        return None, confidence, match_count

    return dict(row), confidence, match_count
