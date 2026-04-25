from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.schemas.query import QueryMatchResponse, QueryRequest, TopicMatch
from backend.services.query_service import embed_query, match_topic

router = APIRouter(prefix="/api/query", tags=["query"])


@router.post("/match", response_model=QueryMatchResponse)
async def match_query_to_topic(
    payload: QueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Embed a natural-language question and return the closest topic cluster."""
    query_embedding = embed_query(payload.question)
    topic_row, confidence, matched_count = await match_topic(db, query_embedding)

    topic = None
    if topic_row is not None:
        topic = TopicMatch(
            slug=topic_row["slug"],
            label=topic_row["label"],
            paper_count=topic_row["paper_count"],
            summary_general=topic_row["summary_general"],
        )

    return QueryMatchResponse(
        topic=topic,
        confidence=confidence,
        matched_paper_count=matched_count,
    )
