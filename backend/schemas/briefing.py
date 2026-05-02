from pydantic import BaseModel, ConfigDict


class BigMovement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = ""
    narrative: str = ""
    topic_slugs: list[str] = []


class TopicNote(BaseModel):
    model_config = ConfigDict(extra="ignore")
    slug: str = ""
    why: str = ""


class CrossPollination(BaseModel):
    model_config = ConfigDict(extra="ignore")
    topic_a_slug: str = ""
    topic_b_slug: str = ""
    shared_signal: str = ""


class DispatchEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    if_you_work_on: str = ""
    also_watch_slugs: list[str] = []
    reason: str = ""


class Prediction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    claim: str = ""
    testable_by: str = ""
    slugs: list[str] = []


class CalibrationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    claim: str = ""
    verdict: str = ""  # "held" | "partial" | "missed"
    evidence: str = ""


class Calibration(BaseModel):
    model_config = ConfigDict(extra="ignore")
    graded: list[CalibrationItem] = []


class BriefingSections(BaseModel):
    model_config = ConfigDict(extra="ignore")
    lede: str = ""
    big_movements: list[BigMovement] = []
    emerging: list[TopicNote] = []
    decelerating: list[TopicNote] = []
    cross_pollinations: list[CrossPollination] = []
    researcher_dispatch: list[DispatchEntry] = []
    open_questions: list[str] = []
    predictions: list[Prediction] = []
    calibration: Calibration | None = None


class BriefingResponse(BaseModel):
    generated_on: str  # ISO date
    model: str
    sections: BriefingSections
    # Hydrated slug → label map for every slug referenced in any section,
    # so the frontend can render topic chips without a second fetch.
    topic_labels: dict[str, str]


class BriefingHistoryItem(BaseModel):
    generated_on: str
    lede: str


class BriefingHistoryResponse(BaseModel):
    items: list[BriefingHistoryItem]
