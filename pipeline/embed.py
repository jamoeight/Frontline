"""
Embedding generation for paper abstracts.

Loads all-MiniLM-L6-v2 and generates 384-dimensional embeddings for
papers that don't have one yet. Processes in batches for efficiency.

Called automatically by ingest.py after new papers are inserted.
Can also be run standalone: python -m pipeline.embed
"""

import asyncio
import time

from sentence_transformers import SentenceTransformer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from backend.config import settings

MODEL_NAME = "all-MiniLM-L6-v2"
BATCH_SIZE = 64


async def get_papers_without_embeddings(session: AsyncSession) -> list[dict]:
    """Fetch papers that don't have embeddings yet."""
    result = await session.execute(
        text("SELECT id, abstract FROM papers WHERE embedding IS NULL ORDER BY id")
    )
    return [{"id": row[0], "abstract": row[1]} for row in result.fetchall()]


async def store_embeddings(session: AsyncSession, paper_ids: list[int], embeddings: list[list[float]]):
    """Write embeddings back to the papers table."""
    for paper_id, embedding in zip(paper_ids, embeddings):
        await session.execute(
            text("UPDATE papers SET embedding = :embedding WHERE id = :id"),
            {"id": paper_id, "embedding": str(embedding)},
        )
    await session.commit()


async def run_embedding():
    """Core embedding function — called by ingest.py or run standalone."""
    print("\n=== Embedding Generation ===")
    start_time = time.time()

    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        papers = await get_papers_without_embeddings(session)

    if not papers:
        print("No papers need embeddings. Done.")
        await engine.dispose()
        return

    print(f"Found {len(papers)} papers without embeddings")
    print(f"Loading model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)

    abstracts = [p["abstract"] for p in papers]
    paper_ids = [p["id"] for p in papers]

    print(f"Generating embeddings in batches of {BATCH_SIZE}...")
    all_embeddings = model.encode(abstracts, batch_size=BATCH_SIZE, show_progress_bar=True)

    print("Storing embeddings in database...")
    async with session_factory() as session:
        for i in range(0, len(paper_ids), BATCH_SIZE):
            batch_ids = paper_ids[i:i + BATCH_SIZE]
            batch_embeddings = [emb.tolist() for emb in all_embeddings[i:i + BATCH_SIZE]]
            await store_embeddings(session, batch_ids, batch_embeddings)
            print(f"  Stored batch {i // BATCH_SIZE + 1}/{(len(paper_ids) + BATCH_SIZE - 1) // BATCH_SIZE}")

    await engine.dispose()

    elapsed_ms = int((time.time() - start_time) * 1000)
    print(f"Embedded {len(papers)} papers in {elapsed_ms}ms")


if __name__ == "__main__":
    asyncio.run(run_embedding())
