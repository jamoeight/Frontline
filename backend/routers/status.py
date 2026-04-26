from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.schemas.status import StatusResponse

router = APIRouter(prefix="/api/status", tags=["status"])

INGEST_SCHEDULE = "Daily at 06:00 UTC"


@router.get("", response_model=StatusResponse)
async def get_status(db: AsyncSession = Depends(get_db)):
    """Return when the daily ingest pipeline last completed successfully."""
    result = await db.execute(
        text("""
            SELECT completed_at, paper_count
            FROM pipeline_runs
            WHERE run_type = 'ingest'
              AND status = 'completed'
              AND completed_at IS NOT NULL
            ORDER BY completed_at DESC
            LIMIT 1
        """)
    )
    row = result.mappings().first()

    return StatusResponse(
        last_ingest_at=row["completed_at"] if row else None,
        last_ingest_papers=row["paper_count"] if row else None,
        schedule=INGEST_SCHEDULE,
    )
