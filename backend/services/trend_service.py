from datetime import date, timedelta
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.schemas.trends import (
    DataPoint,
    SortBy,
    TopicDetail,
    TopicDetailResponse,
    TopicSummary,
    TopicTimeseries,
    TrendListResponse,
    TrendMode,
)

MIN_TOPIC_PAPERS = 10


class TrendService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_trends(
        self,
        window: int,
        mode: TrendMode,
        sort_by: SortBy,
        limit: int,
    ) -> TrendListResponse:
        cutoff = date.today() - timedelta(days=window)

        if mode == TrendMode.SUMMARY:
            topics = await self._get_topic_summaries(cutoff, sort_by, limit)
        else:
            topics = await self._get_topic_timeseries(cutoff, sort_by, limit)

        return TrendListResponse(
            window_days=window,
            mode=mode,
            topics=topics,
            total_count=len(topics),
        )

    async def get_topic_detail(
        self, slug: str, window: int
    ) -> TopicDetailResponse | None:
        cutoff = date.today() - timedelta(days=window)

        result = await self.db.execute(
            text("""
                WITH topic AS (
                    SELECT id, slug, label, paper_count, representative_terms,
                           summary_technical, summary_general, summary_prediction
                    FROM topics WHERE slug = :slug
                )
                SELECT topic.*,
                       tm.metric_date AS week_start,
                       tm.paper_count AS dp_paper_count,
                       tm.growth_rate, tm.acceleration
                FROM topic
                LEFT JOIN trend_metrics tm ON tm.topic_id = topic.id
                    AND tm.period = 'weekly'
                    AND tm.metric_date >= :cutoff
                ORDER BY tm.metric_date
            """),
            {"slug": slug, "cutoff": cutoff},
        )
        rows = list(result.mappings())
        if not rows:
            return None

        first = rows[0]
        data_points = [
            DataPoint(
                week_start=r["week_start"],
                paper_count=r["dp_paper_count"],
                growth_rate=r["growth_rate"],
                acceleration=r["acceleration"],
            )
            for r in rows
            if r["week_start"] is not None
        ]

        latest_growth = data_points[-1].growth_rate if data_points else None
        latest_accel = data_points[-1].acceleration if data_points else None

        topic = TopicDetail(
            slug=first["slug"],
            label=first["label"],
            paper_count=first["paper_count"],
            representative_terms=first["representative_terms"] or [],
            summary_technical=first["summary_technical"],
            summary_general=first["summary_general"],
            summary_prediction=first["summary_prediction"],
            latest_growth_rate=latest_growth,
            latest_acceleration=latest_accel,
            data_points=data_points,
        )

        return TopicDetailResponse(topic=topic, window_days=window)

    async def _get_topic_summaries(
        self, cutoff: date, sort_by: SortBy, limit: int
    ) -> list[TopicSummary]:
        sort_col = {
            SortBy.GROWTH_RATE: "latest_growth_rate",
            SortBy.PAPER_COUNT: "t.paper_count",
        }[sort_by]

        result = await self.db.execute(
            text(f"""
                SELECT t.slug, t.label, t.paper_count, t.representative_terms,
                       t.summary_technical, t.summary_general, t.summary_prediction,
                       latest.growth_rate AS latest_growth_rate,
                       latest.acceleration AS latest_acceleration
                FROM topics t
                LEFT JOIN LATERAL (
                    SELECT tm.growth_rate, tm.acceleration
                    FROM trend_metrics tm
                    WHERE tm.topic_id = t.id
                      AND tm.period = 'weekly'
                      AND tm.metric_date >= :cutoff
                    ORDER BY tm.metric_date DESC
                    LIMIT 1
                ) latest ON true
                WHERE t.paper_count >= :min_papers
                ORDER BY {sort_col} DESC NULLS LAST
                LIMIT :limit
            """),
            {"cutoff": cutoff, "limit": limit, "min_papers": MIN_TOPIC_PAPERS},
        )

        return [
            TopicSummary(
                slug=r["slug"],
                label=r["label"],
                paper_count=r["paper_count"],
                representative_terms=r["representative_terms"] or [],
                summary_technical=r["summary_technical"],
                summary_general=r["summary_general"],
                summary_prediction=r["summary_prediction"],
                latest_growth_rate=r["latest_growth_rate"],
                latest_acceleration=r["latest_acceleration"],
            )
            for r in result.mappings()
        ]

    async def _get_topic_timeseries(
        self, cutoff: date, sort_by: SortBy, limit: int
    ) -> list[TopicTimeseries]:
        sort_col = {
            SortBy.GROWTH_RATE: "windowed.avg_growth",
            SortBy.PAPER_COUNT: "windowed.window_papers",
        }[sort_by]

        topic_result = await self.db.execute(
            text(f"""
                SELECT t.id, t.slug, t.label, t.paper_count,
                       t.summary_general,
                       windowed.avg_growth AS latest_growth_rate,
                       windowed.window_papers
                FROM topics t
                LEFT JOIN LATERAL (
                    SELECT AVG(tm.growth_rate) AS avg_growth,
                           SUM(tm.paper_count) AS window_papers
                    FROM trend_metrics tm
                    WHERE tm.topic_id = t.id
                      AND tm.period = 'weekly'
                      AND tm.metric_date >= :cutoff
                ) windowed ON true
                WHERE t.paper_count >= :min_papers
                ORDER BY {sort_col} DESC NULLS LAST
                LIMIT :limit
            """),
            {"cutoff": cutoff, "limit": limit, "min_papers": MIN_TOPIC_PAPERS},
        )
        topics = list(topic_result.mappings())
        if not topics:
            return []

        topic_ids = [t["id"] for t in topics]

        # Fetch all weekly data points for those topics in one query
        ts_result = await self.db.execute(
            text("""
                SELECT tm.topic_id, tm.metric_date AS week_start,
                       tm.paper_count, tm.growth_rate, tm.acceleration
                FROM trend_metrics tm
                WHERE tm.topic_id = ANY(:topic_ids)
                  AND tm.period = 'weekly'
                  AND tm.metric_date >= :cutoff
                ORDER BY tm.topic_id, tm.metric_date
            """),
            {"topic_ids": topic_ids, "cutoff": cutoff},
        )

        points_by_topic: dict[int, list[DataPoint]] = defaultdict(list)
        for r in ts_result.mappings():
            points_by_topic[r["topic_id"]].append(
                DataPoint(
                    week_start=r["week_start"],
                    paper_count=r["paper_count"],
                    growth_rate=r["growth_rate"],
                    acceleration=r["acceleration"],
                )
            )

        return [
            TopicTimeseries(
                slug=t["slug"],
                label=t["label"],
                paper_count=int(t["window_papers"] or t["paper_count"]),
                summary_general=t["summary_general"],
                latest_growth_rate=t["latest_growth_rate"],
                data_points=points_by_topic.get(t["id"], []),
            )
            for t in topics
        ]
