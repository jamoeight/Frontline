"""
Trend metrics calculation.

Computes weekly paper counts, growth rates, and acceleration for
each topic. Runs after clustering to keep the trend_metrics table
up to date.

Called automatically by ingest.py after clustering.
Can also be run standalone: python -m pipeline.metrics
"""

import asyncio
import time

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from backend.config import settings


async def run_metrics():
    """Compute weekly trend metrics for all topics."""
    print("\n=== Trend Metrics Calculation ===")
    start_time = time.time()

    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        # compute weekly paper counts per topic
        # uses the paper's publication_date truncated to the start of the week
        result = await session.execute(
            text("""
                INSERT INTO trend_metrics (topic_id, metric_date, period, paper_count)
                SELECT
                    pt.topic_id,
                    date_trunc('week', p.publication_date)::date AS week_start,
                    'weekly',
                    COUNT(*)
                FROM paper_topics pt
                JOIN papers p ON p.id = pt.paper_id
                GROUP BY pt.topic_id, week_start
                ON CONFLICT (topic_id, metric_date, period)
                DO UPDATE SET paper_count = EXCLUDED.paper_count
            """)
        )
        await session.commit()
        print(f"  Upserted weekly paper counts")

        # compute growth rates (week-over-week % change)
        await session.execute(
            text("""
                UPDATE trend_metrics tm
                SET growth_rate = CASE
                    WHEN prev.paper_count > 0
                    THEN (tm.paper_count - prev.paper_count)::real / prev.paper_count
                    ELSE NULL
                END
                FROM trend_metrics prev
                WHERE prev.topic_id = tm.topic_id
                  AND prev.period = 'weekly'
                  AND prev.metric_date = tm.metric_date - INTERVAL '7 days'
                  AND tm.period = 'weekly'
            """)
        )
        await session.commit()
        print(f"  Computed growth rates")

        # compute acceleration (change in growth rate)
        await session.execute(
            text("""
                UPDATE trend_metrics tm
                SET acceleration = tm.growth_rate - prev.growth_rate
                FROM trend_metrics prev
                WHERE prev.topic_id = tm.topic_id
                  AND prev.period = 'weekly'
                  AND prev.metric_date = tm.metric_date - INTERVAL '7 days'
                  AND tm.period = 'weekly'
                  AND tm.growth_rate IS NOT NULL
                  AND prev.growth_rate IS NOT NULL
            """)
        )
        await session.commit()
        print(f"  Computed acceleration")

        # update paper_count on the topics table
        await session.execute(
            text("""
                UPDATE topics t
                SET paper_count = sub.total
                FROM (
                    SELECT topic_id, COUNT(*) AS total
                    FROM paper_topics
                    GROUP BY topic_id
                ) sub
                WHERE sub.topic_id = t.id
            """)
        )
        await session.commit()
        print(f"  Updated topic paper counts")

    await engine.dispose()

    elapsed_ms = int((time.time() - start_time) * 1000)
    print(f"Metrics calculated in {elapsed_ms}ms")


if __name__ == "__main__":
    asyncio.run(run_metrics())
