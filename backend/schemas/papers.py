from datetime import date

from pydantic import BaseModel


class PaperItem(BaseModel):
    arxiv_id: str
    title: str
    authors: list[str]
    abstract: str
    publication_date: date
    categories: list[str]
    relevance_score: float


class TopicPapersResponse(BaseModel):
    slug: str
    label: str
    summary_general: str | None = None
    papers: list[PaperItem]
    total_count: int
