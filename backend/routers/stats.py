from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.schemas.stats import StatsResponse

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Return corpus-wide totals for the dashboard headline."""
    result = await db.execute(
        text("""
            SELECT
                (SELECT COUNT(*) FROM papers) AS total_papers,
                (SELECT COUNT(*) FROM papers WHERE embedding IS NOT NULL) AS embedded_papers,
                (SELECT COUNT(*) FROM topics) AS total_topics,
                (SELECT MIN(publication_date) FROM papers) AS earliest_publication_date,
                (SELECT MAX(publication_date) FROM papers) AS latest_publication_date
        """)
    )
    row = result.mappings().one()
    return StatsResponse(**row)
