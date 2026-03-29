from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.schemas.trends import (
    SortBy,
    TimeWindow,
    TopicDetailResponse,
    TrendListResponse,
    TrendMode,
)
from backend.services.trend_service import TrendService

router = APIRouter(prefix="/api/trends", tags=["trends"])


@router.get("", response_model=TrendListResponse)
async def list_trends(
    window: TimeWindow = TimeWindow.DAYS_90,
    mode: TrendMode = TrendMode.TIMESERIES,
    sort_by: SortBy = SortBy.GROWTH_RATE,
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    service = TrendService(db)
    return await service.get_trends(
        window=window.value, mode=mode, sort_by=sort_by, limit=limit
    )


@router.get("/{topic_slug}", response_model=TopicDetailResponse)
async def get_topic_trend(
    topic_slug: str,
    window: TimeWindow = TimeWindow.DAYS_90,
    db: AsyncSession = Depends(get_db),
):
    service = TrendService(db)
    result = await service.get_topic_detail(slug=topic_slug, window=window.value)
    if result is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    return result
