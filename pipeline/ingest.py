"""
arXiv paper ingestion script.

Queries the arXiv API for new papers in the last 24 hours across
cs.AI, cs.CL, cs.CV, cs.LG, cs.NE, and stat.ML. Parses the Atom XML
response and inserts new papers into PostgreSQL. Respects the 3-second
rate limit between API requests.

Usage:
    python -m pipeline.ingest
"""

import asyncio
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from backend.config import settings

ARXIV_API = "https://export.arxiv.org/api/query"
CATEGORIES = ["cs.AI", "cs.CL", "cs.CV", "cs.LG", "cs.NE", "stat.ML"]
ATOM_NS = "{http://www.w3.org/2005/Atom}"
ARXIV_NS = "{http://arxiv.org/schemas/atom}"
RESULTS_PER_PAGE = 100
RATE_LIMIT_SECONDS = 3


def build_query(categories: list[str], date_from: str, date_to: str) -> str:
    """Build the arXiv API search query string."""
    cat_query = " OR ".join(f"cat:{cat}" for cat in categories)
    return f"({cat_query}) AND submittedDate:[{date_from} TO {date_to}]"


def parse_entry(entry: ET.Element) -> dict | None:
    """Parse a single Atom entry into a paper dict."""
    arxiv_id_raw = entry.findtext(f"{ATOM_NS}id", "")
    arxiv_id = arxiv_id_raw.split("/abs/")[-1].split("v")[0] if "/abs/" in arxiv_id_raw else ""
    if not arxiv_id:
        return None

    title = entry.findtext(f"{ATOM_NS}title", "").replace("\n", " ").strip()
    abstract = entry.findtext(f"{ATOM_NS}summary", "").replace("\n", " ").strip()

    authors = []
    for author_el in entry.findall(f"{ATOM_NS}author"):
        name = author_el.findtext(f"{ATOM_NS}name", "").strip()
        if name:
            authors.append(name)

    published_str = entry.findtext(f"{ATOM_NS}published", "")
    try:
        publication_date = datetime.fromisoformat(published_str.replace("Z", "+00:00")).date()
    except ValueError:
        return None

    categories = []
    for cat_el in entry.findall(f"{ARXIV_NS}primary_category") + entry.findall(f"{ATOM_NS}category"):
        term = cat_el.get("term", "")
        if term and term not in categories:
            categories.append(term)

    if not title or not abstract:
        return None

    return {
        "arxiv_id": arxiv_id,
        "title": title,
        "authors": authors,
        "abstract": abstract,
        "categories": categories,
        "publication_date": publication_date,
    }


async def fetch_papers(date_from: str, date_to: str) -> list[dict]:
    """Fetch all papers from arXiv API with pagination and rate limiting."""
    query = build_query(CATEGORIES, date_from, date_to)
    papers = []
    start = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            params = {
                "search_query": query,
                "start": start,
                "max_results": RESULTS_PER_PAGE,
                "sortBy": "submittedDate",
                "sortOrder": "descending",
            }

            print(f"  Fetching results {start} to {start + RESULTS_PER_PAGE}...")
            response = await client.get(ARXIV_API, params=params)
            response.raise_for_status()

            root = ET.fromstring(response.text)
            entries = root.findall(f"{ATOM_NS}entry")

            if not entries:
                break

            for entry in entries:
                paper = parse_entry(entry)
                if paper:
                    papers.append(paper)

            total_results = int(root.findtext("{http://a9.com/-/spec/opensearch/1.1/}totalResults", "0"))

            start += RESULTS_PER_PAGE
            if start >= total_results:
                break

            # respect the 3-second rate limit
            print(f"  Rate limit: waiting {RATE_LIMIT_SECONDS}s...")
            time.sleep(RATE_LIMIT_SECONDS)

    return papers


async def insert_papers(papers: list[dict]) -> int:
    """Insert papers into the database, skipping duplicates. Returns count of new papers."""
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    inserted = 0
    async with session_factory() as session:
        for paper in papers:
            result = await session.execute(
                text("SELECT 1 FROM papers WHERE arxiv_id = :arxiv_id"),
                {"arxiv_id": paper["arxiv_id"]},
            )
            if result.first() is not None:
                continue

            await session.execute(
                text("""
                    INSERT INTO papers (arxiv_id, title, authors, abstract, categories, publication_date)
                    VALUES (:arxiv_id, :title, CAST(:authors AS jsonb), :abstract, :categories, :publication_date)
                """),
                {
                    "arxiv_id": paper["arxiv_id"],
                    "title": paper["title"],
                    "authors": __import__("json").dumps(paper["authors"]),
                    "abstract": paper["abstract"],
                    "categories": paper["categories"],
                    "publication_date": paper["publication_date"],
                },
            )
            inserted += 1

        await session.commit()

    await engine.dispose()
    return inserted


async def log_run(status: str, paper_count: int, processing_time_ms: int, error_message: str | None = None):
    """Log the pipeline run to the pipeline_runs table."""
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        await session.execute(
            text("""
                INSERT INTO pipeline_runs (run_type, status, paper_count, processing_time_ms, error_message, completed_at)
                VALUES ('ingest', :status, :paper_count, :processing_time_ms, :error_message, now())
            """),
            {
                "status": status,
                "paper_count": paper_count,
                "processing_time_ms": processing_time_ms,
                "error_message": error_message,
            },
        )
        await session.commit()

    await engine.dispose()


async def main():
    print("=== Frontline arXiv Ingestion ===")
    start_time = time.time()

    # last 24 hours in arXiv date format (YYYYMMDDHHMMSS)
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=1)).strftime("%Y%m%d0000")
    date_to = now.strftime("%Y%m%d2359")

    print(f"Date range: {date_from} to {date_to}")
    print(f"Categories: {', '.join(CATEGORIES)}")

    try:
        papers = await fetch_papers(date_from, date_to)
        print(f"Fetched {len(papers)} papers from arXiv")

        inserted = await insert_papers(papers)
        print(f"Inserted {inserted} new papers ({len(papers) - inserted} duplicates skipped)")

        # generate embeddings then cluster
        if inserted > 0:
            from pipeline.embed import run_embedding
            await run_embedding()

            from pipeline.cluster import run_clustering
            await run_clustering()

        elapsed_ms = int((time.time() - start_time) * 1000)
        await log_run("completed", inserted, elapsed_ms)
        print(f"Done in {elapsed_ms}ms")

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        await log_run("failed", 0, elapsed_ms, str(e))
        print(f"FAILED: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
