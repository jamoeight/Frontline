from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.schemas.query import (
    CitedPaper,
    QueryAnswerResponse,
    QueryMatchResponse,
    QueryRequest,
    TopicMatch,
)
from backend.services.llm import generate_query_answer
from backend.services.query_service import (
    embed_query,
    get_recent_abstracts_for_topic,
    match_topic,
)

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


@router.post("/ask", response_model=QueryAnswerResponse)
async def ask_question(
    payload: QueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Match a question to a topic, retrieve recent abstracts, and answer via LLM."""
    query_embedding = embed_query(payload.question)
    topic_row, confidence, _ = await match_topic(db, query_embedding)

    if topic_row is None:
        return QueryAnswerResponse(
            question=payload.question,
            answer=None,
            topic=None,
            confidence=confidence,
            cited_papers=[],
        )

    abstracts = await get_recent_abstracts_for_topic(db, topic_row["id"])

    if not abstracts:
        return QueryAnswerResponse(
            question=payload.question,
            answer=None,
            topic=TopicMatch(
                slug=topic_row["slug"],
                label=topic_row["label"],
                paper_count=topic_row["paper_count"],
                summary_general=topic_row["summary_general"],
            ),
            confidence=confidence,
            cited_papers=[],
        )

    answer = await generate_query_answer(
        question=payload.question,
        topic_label=topic_row["label"],
        abstracts=abstracts,
    )

    cited = [
        CitedPaper(
            arxiv_id=a["arxiv_id"],
            title=a["title"],
            publication_date=str(a["publication_date"]),
        )
        for a in abstracts
    ]

    return QueryAnswerResponse(
        question=payload.question,
        answer=answer,
        topic=TopicMatch(
            slug=topic_row["slug"],
            label=topic_row["label"],
            paper_count=topic_row["paper_count"],
            summary_general=topic_row["summary_general"],
        ),
        confidence=confidence,
        cited_papers=cited,
    )
