from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.schemas.trending import TrendingListResponse, TrendingTopic

router = APIRouter(prefix="/api/trending", tags=["trending"])

MIN_TOPIC_PAPERS = 10
RECENT_METRIC_DAYS = 14


@router.get("", response_model=TrendingListResponse)
async def get_trending(
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Return the fastest growing topics this week with growth metrics and summaries.

    Filters out topics below MIN_TOPIC_PAPERS (whose week-over-week growth
    is dominated by tiny denominators like 1->30 = 3000%) and topics whose
    latest weekly metric is older than RECENT_METRIC_DAYS (stale spikes
    from dormant clusters).
    """
    recent_cutoff = date.today() - timedelta(days=RECENT_METRIC_DAYS)

    result = await db.execute(
        text("""
            SELECT t.slug, t.label, t.paper_count,
                   t.summary_technical, t.summary_general, t.summary_prediction,
                   latest.growth_rate
            FROM topics t
            LEFT JOIN LATERAL (
                SELECT tm.growth_rate, tm.metric_date
                FROM trend_metrics tm
                WHERE tm.topic_id = t.id
                  AND tm.period = 'weekly'
                ORDER BY tm.metric_date DESC
                LIMIT 1
            ) latest ON true
            WHERE latest.growth_rate IS NOT NULL
              AND latest.metric_date >= :recent_cutoff
              AND t.paper_count >= :min_papers
            ORDER BY latest.growth_rate DESC
            LIMIT :limit
        """),
        {
            "limit": limit,
            "recent_cutoff": recent_cutoff,
            "min_papers": MIN_TOPIC_PAPERS,
        },
    )

    topics = [
        TrendingTopic(
            slug=r["slug"],
            label=r["label"],
            paper_count=r["paper_count"],
            growth_rate=r["growth_rate"],
            summary_technical=r["summary_technical"],
            summary_general=r["summary_general"],
            summary_prediction=r["summary_prediction"],
        )
        for r in result.mappings()
    ]

    return TrendingListResponse(topics=topics, total_count=len(topics))
