from pydantic import BaseModel


class TrendingTopic(BaseModel):
    slug: str
    label: str
    paper_count: int
    growth_rate: float | None = None
    summary_technical: str | None = None
    summary_general: str | None = None
    summary_prediction: str | None = None


class TrendingListResponse(BaseModel):
    topics: list[TrendingTopic]
    total_count: int
