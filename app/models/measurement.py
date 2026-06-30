from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from app.models.estimation import EstimateRange

MetricDataKind = Literal["measured", "simulated"]
MetricSource = Literal[
    "ga4_shopify_mock",
    "ga4_shopify",
    "media_plan_mock",
    "media_plan_model",
    "mock_media",
]


class MetricSeriesPoint(BaseModel):
    timestamp: datetime
    value: float | None = None
    data_kind: MetricDataKind
    source: MetricSource
    low: float | None = None
    high: float | None = None


class MetricSnapshot(BaseModel):
    id: str = Field(default_factory=lambda: f"met_{uuid4().hex}")
    source: Literal["ga4_shopify_mock", "ga4_shopify"]
    data_kind: MetricDataKind
    sessions: int = Field(ge=0)
    conversions: int = Field(ge=0)
    orders: int = Field(ge=0)
    revenue_jpy: int = Field(ge=0)
    ad_spend_jpy: int = Field(ge=0)
    cpa_jpy: float = Field(ge=0)
    cpa_jpy_range: EstimateRange | None = None
    roas: float = Field(ge=0)
    roas_range: EstimateRange | None = None
    conversions_range: EstimateRange | None = None
    confidence: float = Field(ge=0, le=1)
    labels: dict[str, MetricDataKind]
    series: dict[str, list[MetricSeriesPoint]] = Field(default_factory=dict)
    measured_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
