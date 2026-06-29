from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

MetricDataKind = Literal["measured", "simulated"]


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
    roas: float = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    labels: dict[str, MetricDataKind]
    measured_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
