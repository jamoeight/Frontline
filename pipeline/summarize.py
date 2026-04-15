"""
Summary generation for topic clusters.

After clustering, sends each topic's abstracts to gpt-oss-120b via
OpenRouter and stores the three summary variants (technical, general,
prediction) in the topics table.

Called automatically by ingest.py after metrics calculation.
Can also be run standalone: python -m pipeline.summarize
"""

import asyncio
import time

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from backend.config import settings
from backend.services.llm import generate_summaries


async def run_summarization():
    """Generate LLM summaries for all topics."""
    print("\n=== Summary Generation ===")
    start_time = time.time()

    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        # get all topics
        result = await session.execute(
            text("SELECT id, label, slug FROM topics ORDER BY paper_count DESC")
        )
        topics = [{"id": r[0], "label": r[1], "slug": r[2]} for r in result.fetchall()]

    if not topics:
        print("No topics to summarize. Done.")
        await engine.dispose()
        return

    print(f"Generating summaries for {len(topics)} topics...")

    for i, topic in enumerate(topics):
        # fetch abstracts for this topic
        async with session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT p.abstract
                    FROM papers p
                    JOIN paper_topics pt ON pt.paper_id = p.id
                    WHERE pt.topic_id = :topic_id
                    ORDER BY p.publication_date DESC
                    LIMIT 30
                """),
                {"topic_id": topic["id"]},
            )
            abstracts = [r[0] for r in result.fetchall()]

        if not abstracts:
            print(f"  [{i+1}/{len(topics)}] {topic['label']} — no abstracts, skipping")
            continue

        print(f"  [{i+1}/{len(topics)}] {topic['label']} ({len(abstracts)} abstracts)...")

        try:
            summaries = await generate_summaries(topic["label"], abstracts)

            async with session_factory() as session:
                await session.execute(
                    text("""
                        UPDATE topics
                        SET summary_technical = :technical,
                            summary_general = :general,
                            summary_prediction = :prediction,
                            updated_at = now()
                        WHERE id = :id
                    """),
                    {
                        "id": topic["id"],
                        "technical": summaries.technical,
                        "general": summaries.general,
                        "prediction": summaries.prediction,
                    },
                )
                await session.commit()

        except Exception as e:
            print(f"    ERROR generating summary: {e}")
            continue

    await engine.dispose()

    elapsed_ms = int((time.time() - start_time) * 1000)
    print(f"Summaries generated in {elapsed_ms}ms")


if __name__ == "__main__":
    asyncio.run(run_summarization())
