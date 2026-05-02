"""
State of the State — weekly cross-cluster synthesis briefing.

Runs after summarize.py. Builds a single LLM prompt covering all top topics,
their week-over-week movement, and numerically-detected centroid convergences;
asks the model to return a structured editorial briefing in JSON. Also grades
the *previous* briefing's predictions against this week's data so the public
calibration ledger keeps the feature honest.

Invoked by ingest.py. Can also be run standalone: python -m pipeline.state_of_state
"""

import asyncio
import json
import time
from datetime import date, timedelta

import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from backend.config import settings
from backend.services.llm import generate_state_of_state

TOP_N_TOPICS = 30
RECENT_DAYS = 14
PRIOR_WINDOW_DAYS = 30  # days *before* the recent window
TOP_PAIRS = 5
MIN_TOPIC_PAPERS = 10
MIN_TOPICS_FOR_BRIEFING = 3


def _parse_vec(raw) -> np.ndarray | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        return np.array(json.loads(raw), dtype=np.float32)
    return np.array(raw, dtype=np.float32)


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


async def _fetch_topics(session: AsyncSession) -> list[dict]:
    """Top-N topics ordered by recent activity, joined with their latest weekly metric."""
    result = await session.execute(
        text("""
            SELECT
                t.id, t.slug, t.label, t.paper_count,
                t.summary_general, t.representative_terms,
                latest.metric_date,
                latest.paper_count AS week_papers,
                latest.growth_rate,
                latest.acceleration
            FROM topics t
            LEFT JOIN LATERAL (
                SELECT tm.metric_date, tm.paper_count, tm.growth_rate, tm.acceleration
                FROM trend_metrics tm
                WHERE tm.topic_id = t.id
                  AND tm.period = 'weekly'
                ORDER BY tm.metric_date DESC
                LIMIT 1
            ) latest ON true
            WHERE t.paper_count >= :min_papers
            ORDER BY COALESCE(latest.paper_count, 0) DESC, t.paper_count DESC
            LIMIT :limit
        """),
        {"min_papers": MIN_TOPIC_PAPERS, "limit": TOP_N_TOPICS},
    )
    return [
        {
            "id": r["id"],
            "slug": r["slug"],
            "label": r["label"],
            "paper_count": r["paper_count"],
            "summary_general": r["summary_general"],
            "representative_terms": list(r["representative_terms"] or []),
            "week_papers": r["week_papers"] or 0,
            "growth_rate": r["growth_rate"],
            "acceleration": r["acceleration"],
        }
        for r in result.mappings()
    ]


async def _fetch_centroids(
    session: AsyncSession,
    topic_ids: list[int],
    since: date,
    until: date | None = None,
) -> dict[int, np.ndarray]:
    """Mean embedding per topic over a date window. Topics with no papers are omitted."""
    if not topic_ids:
        return {}
    # IDs come from the database — safe to inline.
    ids_csv = ",".join(str(int(i)) for i in topic_ids)
    query = f"""
        SELECT pt.topic_id, p.embedding::text AS emb
        FROM paper_topics pt
        JOIN papers p ON p.id = pt.paper_id
        WHERE pt.topic_id IN ({ids_csv})
          AND p.embedding IS NOT NULL
          AND p.publication_date >= :since
    """
    params: dict = {"since": since}
    if until is not None:
        query += " AND p.publication_date < :until"
        params["until"] = until

    result = await session.execute(text(query), params)
    by_topic: dict[int, list[np.ndarray]] = {}
    for r in result.mappings():
        v = _parse_vec(r["emb"])
        if v is not None:
            by_topic.setdefault(r["topic_id"], []).append(v)

    return {tid: np.mean(np.stack(vecs), axis=0) for tid, vecs in by_topic.items() if vecs}


def _compute_pairs(
    topics: list[dict],
    recent: dict[int, np.ndarray],
    prior: dict[int, np.ndarray],
) -> list[dict]:
    """Top pairs ranked by recent similarity + 2x convergence delta.

    The +2x weight on delta favors clusters that are *moving toward* each other
    over clusters that have always been adjacent — those are the surprising
    signals worth surfacing.
    """
    pairs: list[dict] = []
    for i in range(len(topics)):
        for j in range(i + 1, len(topics)):
            ta, tb = topics[i], topics[j]
            ra, rb = recent.get(ta["id"]), recent.get(tb["id"])
            if ra is None or rb is None:
                continue
            sim_now = _cosine(ra, rb)
            pa, pb = prior.get(ta["id"]), prior.get(tb["id"])
            if pa is not None and pb is not None:
                delta = sim_now - _cosine(pa, pb)
            else:
                delta = 0.0
            pairs.append({
                "a_slug": ta["slug"], "a_label": ta["label"],
                "b_slug": tb["slug"], "b_label": tb["label"],
                "similarity": sim_now,
                "similarity_delta": delta,
                "_score": sim_now + 2.0 * delta,
            })
    pairs.sort(key=lambda p: p["_score"], reverse=True)
    return [{k: v for k, v in p.items() if k != "_score"} for p in pairs[:TOP_PAIRS]]


async def _fetch_prior_briefing(session: AsyncSession) -> dict | None:
    result = await session.execute(
        text("""
            SELECT generated_on, sections
            FROM state_of_state
            ORDER BY generated_on DESC
            LIMIT 1
        """)
    )
    row = result.mappings().first()
    if row is None:
        return None
    sections = row["sections"]
    if isinstance(sections, str):
        sections = json.loads(sections)
    return {
        "generated_on": row["generated_on"].isoformat(),
        "predictions": sections.get("predictions") or [],
    }


async def _start_pipeline_run(session: AsyncSession) -> int:
    result = await session.execute(
        text("""
            INSERT INTO pipeline_runs (run_type, status)
            VALUES ('state_of_state', 'running')
            RETURNING id
        """)
    )
    run_id = result.scalar_one()
    await session.commit()
    return run_id


async def _finish_pipeline_run(
    session: AsyncSession,
    run_id: int,
    status: str,
    elapsed_ms: int,
    error_message: str | None = None,
):
    await session.execute(
        text("""
            UPDATE pipeline_runs
            SET status = :status,
                processing_time_ms = :ms,
                error_message = :err,
                completed_at = now()
            WHERE id = :id
        """),
        {"status": status, "ms": elapsed_ms, "err": error_message, "id": run_id},
    )
    await session.commit()


async def run_state_of_state():
    """Generate the daily State of the State briefing."""
    print("\n=== State of the State ===")
    start_time = time.time()

    if not settings.openrouter_api_key:
        print("OPENROUTER_API_KEY not set — skipping briefing.")
        return

    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    run_id: int | None = None

    try:
        async with session_factory() as session:
            run_id = await _start_pipeline_run(session)

        async with session_factory() as session:
            topics = await _fetch_topics(session)
            if len(topics) < MIN_TOPICS_FOR_BRIEFING:
                print(f"Only {len(topics)} qualifying topics — not enough to synthesize.")
                async with session_factory() as s2:
                    await _finish_pipeline_run(
                        s2, run_id, "completed",
                        int((time.time() - start_time) * 1000),
                        error_message="insufficient topics",
                    )
                return

            print(f"Synthesizing across {len(topics)} topics...")

            tids = [t["id"] for t in topics]
            recent_since = date.today() - timedelta(days=RECENT_DAYS)
            prior_since = date.today() - timedelta(days=RECENT_DAYS + PRIOR_WINDOW_DAYS)

            recent = await _fetch_centroids(session, tids, recent_since)
            prior = await _fetch_centroids(session, tids, prior_since, recent_since)
            pairs = _compute_pairs(topics, recent, prior)
            prior_briefing = await _fetch_prior_briefing(session)

        snapshot = [{k: v for k, v in t.items() if k != "id"} for t in topics]

        try:
            sections = await generate_state_of_state(snapshot, pairs, prior_briefing)
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            err_msg = f"{type(e).__name__}: {e}"
            print(f"  ERROR generating briefing: {err_msg}")
            async with session_factory() as session:
                await _finish_pipeline_run(session, run_id, "failed", elapsed_ms, err_msg[:500])
            return

        elapsed_ms = int((time.time() - start_time) * 1000)
        async with session_factory() as session:
            await session.execute(
                text("""
                    INSERT INTO state_of_state
                        (generated_on, pipeline_run_id, model, sections, input_snapshot)
                    VALUES (:d, :rid, :model,
                            CAST(:sections AS jsonb),
                            CAST(:snapshot AS jsonb))
                    ON CONFLICT (generated_on) DO UPDATE
                    SET pipeline_run_id = EXCLUDED.pipeline_run_id,
                        model = EXCLUDED.model,
                        sections = EXCLUDED.sections,
                        input_snapshot = EXCLUDED.input_snapshot
                """),
                {
                    "d": date.today(),
                    "rid": run_id,
                    "model": settings.openrouter_model,
                    "sections": json.dumps(sections, default=str),
                    "snapshot": json.dumps(
                        {"topics": snapshot, "pairs": pairs}, default=str
                    ),
                },
            )
            await session.commit()
            await _finish_pipeline_run(session, run_id, "completed", elapsed_ms)

        print(f"State of the State written in {elapsed_ms}ms")

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        err_msg = f"{type(e).__name__}: {e}"
        print(f"FAILED: {err_msg}")
        if run_id is not None:
            async with session_factory() as session:
                await _finish_pipeline_run(session, run_id, "failed", elapsed_ms, err_msg[:500])
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run_state_of_state())
