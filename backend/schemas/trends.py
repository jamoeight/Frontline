from datetime import date
from enum import Enum

from pydantic import BaseModel


class TimeWindow(int, Enum):
    DAYS_30 = 30
    DAYS_60 = 60
    DAYS_90 = 90


class TrendMode(str, Enum):
    SUMMARY = "summary"
    TIMESERIES = "timeseries"


class SortBy(str, Enum):
    GROWTH_RATE = "growth_rate"
    PAPER_COUNT = "paper_count"


class DataPoint(BaseModel):
    week_start: date
    paper_count: int
    growth_rate: float | None = None
    acceleration: float | None = None


class TopicSummary(BaseModel):
    slug: str
    label: str
    paper_count: int
    representative_terms: list[str]
    summary_technical: str | None = None
    summary_general: str | None = None
    summary_prediction: str | None = None
    latest_growth_rate: float | None = None
    latest_acceleration: float | None = None


class TopicTimeseries(BaseModel):
    slug: str
    label: str
    paper_count: int
    summary_general: str | None = None
    latest_growth_rate: float | None = None
    data_points: list[DataPoint]


class TopicDetail(TopicSummary):
    data_points: list[DataPoint] = []


class TrendListResponse(BaseModel):
    window_days: int
    mode: TrendMode
    topics: list[TopicSummary | TopicTimeseries]
    total_count: int


class TopicDetailResponse(BaseModel):
    topic: TopicDetail
    window_days: int
