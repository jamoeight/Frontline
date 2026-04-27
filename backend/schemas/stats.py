from datetime import date

from pydantic import BaseModel


class StatsResponse(BaseModel):
    total_papers: int
    embedded_papers: int
    total_topics: int
    earliest_publication_date: date | None
    latest_publication_date: date | None
