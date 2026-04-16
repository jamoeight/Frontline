from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.schemas.papers import PaperItem, TopicPapersResponse

router = APIRouter(prefix="/api/topics", tags=["papers"])


@router.get("/{topic_slug}/papers", response_model=TopicPapersResponse)
async def get_topic_papers(
    topic_slug: str,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="date", pattern="^(date|relevance)$"),
    db: AsyncSession = Depends(get_db),
):
    """Return papers in a topic cluster with sorting and pagination."""
    # get the topic
    topic_result = await db.execute(
        text("SELECT id, slug, label, summary_general FROM topics WHERE slug = :slug"),
        {"slug": topic_slug},
    )
    topic = topic_result.mappings().first()
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    # sort column
    order = "p.publication_date DESC" if sort_by == "date" else "pt.relevance_score DESC"

    # get papers
    result = await db.execute(
        text(f"""
            SELECT p.arxiv_id, p.title, p.authors, p.abstract,
                   p.publication_date, p.categories, pt.relevance_score
            FROM papers p
            JOIN paper_topics pt ON pt.paper_id = p.id
            WHERE pt.topic_id = :topic_id
            ORDER BY {order}
            LIMIT :limit OFFSET :offset
        """),
        {"topic_id": topic["id"], "limit": limit, "offset": offset},
    )

    papers = [
        PaperItem(
            arxiv_id=r["arxiv_id"],
            title=r["title"],
            authors=r["authors"] if isinstance(r["authors"], list) else [],
            abstract=r["abstract"],
            publication_date=r["publication_date"],
            categories=r["categories"] if isinstance(r["categories"], list) else [],
            relevance_score=r["relevance_score"],
        )
        for r in result.mappings()
    ]

    # total count for pagination
    count_result = await db.execute(
        text("SELECT COUNT(*) FROM paper_topics WHERE topic_id = :topic_id"),
        {"topic_id": topic["id"]},
    )
    total = count_result.scalar() or 0

    return TopicPapersResponse(
        slug=topic["slug"],
        label=topic["label"],
        summary_general=topic["summary_general"],
        papers=papers,
        total_count=total,
    )
