import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.schemas.briefing import (
    BriefingHistoryItem,
    BriefingHistoryResponse,
    BriefingResponse,
    BriefingSections,
)

router = APIRouter(prefix="/api/briefing", tags=["briefing"])


def _coerce_sections(raw) -> dict:
    """The DB column is JSONB; SQLAlchemy may return either dict or str."""
    if isinstance(raw, str):
        return json.loads(raw)
    return raw or {}


def _collect_slugs(sections: dict) -> set[str]:
    """Every slug the LLM referenced anywhere — used to hydrate labels in one query."""
    slugs: set[str] = set()
    for m in sections.get("big_movements") or []:
        slugs.update(m.get("topic_slugs") or [])
    for n in (sections.get("emerging") or []) + (sections.get("decelerating") or []):
        if n.get("slug"):
            slugs.add(n["slug"])
    for p in sections.get("cross_pollinations") or []:
        if p.get("topic_a_slug"):
            slugs.add(p["topic_a_slug"])
        if p.get("topic_b_slug"):
            slugs.add(p["topic_b_slug"])
    for d in sections.get("researcher_dispatch") or []:
        slugs.update(d.get("also_watch_slugs") or [])
    for pr in sections.get("predictions") or []:
        slugs.update(pr.get("slugs") or [])
    return slugs


async def _fetch_labels(db: AsyncSession, slugs: set[str]) -> dict[str, str]:
    if not slugs:
        return {}
    result = await db.execute(
        text("SELECT slug, label FROM topics WHERE slug = ANY(:slugs)"),
        {"slugs": list(slugs)},
    )
    return {r["slug"]: r["label"] for r in result.mappings()}


@router.get("", response_model=BriefingResponse)
async def get_latest_briefing(db: AsyncSession = Depends(get_db)):
    """Return the most recent State of the State briefing.

    Hydrates every slug the briefing references with its current topic label
    so the frontend can render chip-links without a second fetch.
    """
    result = await db.execute(
        text("""
            SELECT generated_on, model, sections
            FROM state_of_state
            ORDER BY generated_on DESC
            LIMIT 1
        """)
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="No briefing has been generated yet.")

    sections_raw = _coerce_sections(row["sections"])
    slugs = _collect_slugs(sections_raw)
    labels = await _fetch_labels(db, slugs)

    return BriefingResponse(
        generated_on=row["generated_on"].isoformat(),
        model=row["model"],
        sections=BriefingSections.model_validate(sections_raw),
        topic_labels=labels,
    )


@router.get("/history", response_model=BriefingHistoryResponse)
async def get_briefing_history(
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Compact list (date + lede) for an archive view or calibration history."""
    result = await db.execute(
        text("""
            SELECT generated_on, sections
            FROM state_of_state
            ORDER BY generated_on DESC
            LIMIT :limit
        """),
        {"limit": limit},
    )
    items = []
    for row in result.mappings():
        sections = _coerce_sections(row["sections"])
        items.append(BriefingHistoryItem(
            generated_on=row["generated_on"].isoformat(),
            lede=sections.get("lede", "") or "",
        ))
    return BriefingHistoryResponse(items=items)
