from datetime import datetime

from pydantic import BaseModel


class StatusResponse(BaseModel):
    last_ingest_at: datetime | None
    last_ingest_papers: int | None
    schedule: str
