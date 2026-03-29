from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Real,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector


class Base(DeclarativeBase):
    pass


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="running")
    paper_count: Mapped[int | None] = mapped_column(Integer, default=0)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    arxiv_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    authors: Mapped[dict] = mapped_column(JSONB, nullable=False)
    abstract: Mapped[str] = mapped_column(Text, nullable=False)
    categories: Mapped[list] = mapped_column(ARRAY(Text), nullable=False)
    publication_date: Mapped[date] = mapped_column(Date, nullable=False)
    embedding = mapped_column(Vector(384))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    topics: Mapped[list["PaperTopic"]] = relationship(back_populates="paper")


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    summary_technical: Mapped[str | None] = mapped_column(Text)
    summary_general: Mapped[str | None] = mapped_column(Text)
    summary_prediction: Mapped[str | None] = mapped_column(Text)
    representative_terms: Mapped[list] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}"
    )
    paper_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cluster_run_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("pipeline_runs.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    papers: Mapped[list["PaperTopic"]] = relationship(back_populates="topic")
    metrics: Mapped[list["TrendMetric"]] = relationship(back_populates="topic")


class PaperTopic(Base):
    __tablename__ = "paper_topics"

    paper_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True
    )
    topic_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True
    )
    relevance_score: Mapped[float] = mapped_column(Real, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    paper: Mapped["Paper"] = relationship(back_populates="topics")
    topic: Mapped["Topic"] = relationship(back_populates="papers")

    __table_args__ = (
        CheckConstraint("relevance_score >= 0 AND relevance_score <= 1"),
    )


class TrendMetric(Base):
    __tablename__ = "trend_metrics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    topic_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False
    )
    metric_date: Mapped[date] = mapped_column(Date, nullable=False)
    period: Mapped[str] = mapped_column(String(10), nullable=False)
    paper_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    growth_rate: Mapped[float | None] = mapped_column(Real)
    acceleration: Mapped[float | None] = mapped_column(Real)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    topic: Mapped["Topic"] = relationship(back_populates="metrics")

    __table_args__ = (
        UniqueConstraint("topic_id", "metric_date", "period"),
        CheckConstraint("period IN ('daily', 'weekly')"),
    )
