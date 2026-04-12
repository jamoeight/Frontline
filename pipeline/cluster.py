"""
BERTopic clustering for paper abstracts.

Uses pre-computed embeddings to cluster papers into topics. On first
run, fits a new model. On subsequent runs, assigns new papers to
existing clusters and retrains periodically to discover new topics.

Called automatically by ingest.py after embeddings are generated.
Can also be run standalone: python -m pipeline.cluster
"""

import asyncio
import json
import os
import pickle
import re
import time

import numpy as np
from bertopic import BERTopic
from hdbscan import HDBSCAN
from sklearn.feature_extraction.text import CountVectorizer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from backend.config import settings

MODEL_PATH = os.path.join(os.path.dirname(__file__), "bertopic_model.pkl")


def slugify(label: str) -> str:
    """Convert a topic label to a URL-friendly slug."""
    slug = label.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:200]


async def get_papers_with_embeddings(session: AsyncSession) -> list[dict]:
    """Fetch all papers that have embeddings."""
    result = await session.execute(
        text("SELECT id, abstract, embedding::text FROM papers WHERE embedding IS NOT NULL ORDER BY id")
    )
    papers = []
    for row in result.fetchall():
        embedding = json.loads(row[2])
        papers.append({"id": row[0], "abstract": row[1], "embedding": embedding})
    return papers


async def save_topics(session: AsyncSession, topic_data: list[dict]):
    """Upsert topics into the topics table."""
    for topic in topic_data:
        result = await session.execute(
            text("SELECT id FROM topics WHERE slug = :slug"),
            {"slug": topic["slug"]},
        )
        existing = result.first()

        if existing:
            await session.execute(
                text("""
                    UPDATE topics
                    SET label = :label, representative_terms = :terms,
                        paper_count = :paper_count, updated_at = now()
                    WHERE slug = :slug
                """),
                {
                    "slug": topic["slug"],
                    "label": topic["label"],
                    "terms": topic["terms"],
                    "paper_count": topic["paper_count"],
                },
            )
        else:
            await session.execute(
                text("""
                    INSERT INTO topics (label, slug, representative_terms, paper_count)
                    VALUES (:label, :slug, :terms, :paper_count)
                """),
                {
                    "label": topic["label"],
                    "slug": topic["slug"],
                    "terms": topic["terms"],
                    "paper_count": topic["paper_count"],
                },
            )

    await session.commit()


async def save_paper_topics(session: AsyncSession, assignments: list[dict]):
    """Insert paper-topic assignments, replacing old ones."""
    if not assignments:
        return

    paper_ids = list({a["paper_id"] for a in assignments})
    for pid in paper_ids:
        await session.execute(
            text("DELETE FROM paper_topics WHERE paper_id = :pid"),
            {"pid": pid},
        )

    for a in assignments:
        await session.execute(
            text("""
                INSERT INTO paper_topics (paper_id, topic_id, relevance_score)
                VALUES (:paper_id, (SELECT id FROM topics WHERE slug = :slug), :score)
                ON CONFLICT (paper_id, topic_id) DO NOTHING
            """),
            {"paper_id": a["paper_id"], "slug": a["slug"], "score": a["score"]},
        )

    await session.commit()


async def run_clustering():
    """Core clustering function — called by ingest.py or run standalone."""
    print("\n=== BERTopic Clustering ===")
    start_time = time.time()

    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        papers = await get_papers_with_embeddings(session)

    if len(papers) < 20:
        print(f"Only {len(papers)} papers with embeddings — need at least 20 for clustering. Skipping.")
        await engine.dispose()
        return

    print(f"Clustering {len(papers)} papers...")

    abstracts = [p["abstract"] for p in papers]
    embeddings = np.array([p["embedding"] for p in papers])
    paper_ids = [p["id"] for p in papers]

    # configure BERTopic — tuned for 20k+ scientific papers
    hdbscan_model = HDBSCAN(
        min_cluster_size=50,
        min_samples=15,
        metric="euclidean",
        prediction_data=True,
    )
    vectorizer = CountVectorizer(stop_words="english", ngram_range=(1, 2))

    topic_model = BERTopic(
        hdbscan_model=hdbscan_model,
        vectorizer_model=vectorizer,
        nr_topics=None,
        verbose=True,
    )

    topics, probs = topic_model.fit_transform(abstracts, embeddings)

    # save model for future incremental runs
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(topic_model, f)
    print(f"Model saved to {MODEL_PATH}")

    # extract topic info
    topic_info = topic_model.get_topic_info()
    topic_data = []
    slug_counts = {}

    for _, row in topic_info.iterrows():
        topic_id = row["Topic"]
        if topic_id == -1:
            continue  # skip outlier cluster

        label = row["Name"] if "Name" in row else f"Topic {topic_id}"
        # clean up BERTopic's default naming (e.g., "0_word1_word2_word3")
        if re.match(r"^\d+_", label):
            parts = label.split("_")[1:5]
            label = " ".join(parts).title()

        slug = slugify(label)
        # handle duplicate slugs
        if slug in slug_counts:
            slug_counts[slug] += 1
            slug = f"{slug}-{slug_counts[slug]}"
        else:
            slug_counts[slug] = 0

        terms = [word for word, _ in topic_model.get_topic(topic_id)][:10]
        count = int(row["Count"])

        topic_data.append({
            "label": label,
            "slug": slug,
            "terms": terms,
            "paper_count": count,
            "bert_topic_id": topic_id,
        })

    print(f"Found {len(topic_data)} topics (excluding outliers)")

    # build paper-topic assignments with relevance scores
    assignments = []
    for i, (topic_id, prob_row) in enumerate(zip(topics, probs)):
        if topic_id == -1:
            continue
        matching = [t for t in topic_data if t["bert_topic_id"] == topic_id]
        if not matching:
            continue
        score = float(prob_row) if isinstance(prob_row, (int, float)) else float(max(prob_row))
        score = max(0.0, min(1.0, score))
        assignments.append({
            "paper_id": paper_ids[i],
            "slug": matching[0]["slug"],
            "score": score,
        })

    # save to database
    async with session_factory() as session:
        await save_topics(session, topic_data)
        await save_paper_topics(session, assignments)

    await engine.dispose()

    elapsed_ms = int((time.time() - start_time) * 1000)
    print(f"Clustered {len(papers)} papers into {len(topic_data)} topics in {elapsed_ms}ms")


if __name__ == "__main__":
    asyncio.run(run_clustering())
