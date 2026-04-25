from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


class TopicMatch(BaseModel):
    slug: str
    label: str
    paper_count: int
    summary_general: str | None = None


class QueryMatchResponse(BaseModel):
    topic: TopicMatch | None
    confidence: float
    matched_paper_count: int
