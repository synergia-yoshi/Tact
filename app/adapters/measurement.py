from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field

from app.models.estimation import EstimateRange
from app.models.measurement import MetricSeriesPoint, MetricSnapshot


class MeasurementReadRequest(BaseModel):
    org_id: str
    campaign_id: str
    campaign_name: str
    total_budget_jpy: int = Field(gt=0)


class MeasurementAdapter(ABC):
    @abstractmethod
    async def fetch_snapshot(self, request: MeasurementReadRequest) -> MetricSnapshot:
        """Fetch read-only measurement data before any outbound media mutation."""


class MockMeasurementAdapter(MeasurementAdapter):
    async def fetch_snapshot(self, request: MeasurementReadRequest) -> MetricSnapshot:
        seed = int(
            hashlib.sha256(
                f"{request.org_id}:{request.campaign_id}:{request.campaign_name}".encode()
            ).hexdigest()[:8],
            16,
        )
        sessions = 800 + seed % 5000
        conversions = max(1, sessions // 45)
        orders = max(1, conversions - (seed % 3))
        revenue = orders * max(3000, request.total_budget_jpy // 20)
        ad_spend = max(1, min(request.total_budget_jpy, request.total_budget_jpy // 4))
        cpa = round(ad_spend / conversions, 2)
        roas = round(revenue / ad_spend, 2)
        confidence = 0.62
        measured_at = datetime.now(tz=UTC)
        return MetricSnapshot(
            source="ga4_shopify_mock",
            data_kind="simulated",
            sessions=sessions,
            conversions=conversions,
            orders=orders,
            revenue_jpy=revenue,
            ad_spend_jpy=ad_spend,
            cpa_jpy=cpa,
            cpa_jpy_range=_estimate_range(cpa, uncertainty=0.18, confidence=confidence),
            roas=roas,
            roas_range=_estimate_range(roas, uncertainty=0.12, confidence=confidence),
            conversions_range=_estimate_range(
                conversions,
                uncertainty=0.15,
                confidence=confidence,
            ),
            confidence=confidence,
            labels={
                "sessions": "simulated",
                "conversions": "simulated",
                "orders": "simulated",
                "revenue_jpy": "simulated",
                "ad_spend_jpy": "simulated",
                "cpa_jpy": "simulated",
                "roas": "simulated",
            },
            series={
                "conversions": _mock_series(
                    measured_at=measured_at,
                    total=conversions,
                    points=8,
                    gap_index=3,
                )
            },
            measured_at=measured_at,
        )


def _estimate_range(value: float, *, uncertainty: float, confidence: float) -> EstimateRange:
    return EstimateRange(
        low=round(value * (1 - uncertainty), 2),
        high=round(value * (1 + uncertainty), 2),
        confidence=confidence,
        source="mock",
    )


def _mock_series(
    *,
    measured_at: datetime,
    total: int,
    points: int,
    gap_index: int,
) -> list[MetricSeriesPoint]:
    daily_base = max(1, total // max(1, points - 1))
    series: list[MetricSeriesPoint] = []
    for index in range(points):
        timestamp = measured_at - timedelta(days=points - 1 - index)
        value: float | None
        if index == gap_index:
            value = None
        else:
            value = max(1, daily_base + ((index % 3) - 1))
        series.append(
            MetricSeriesPoint(
                timestamp=timestamp,
                value=value,
                data_kind="simulated",
                source="ga4_shopify_mock",
                low=None if value is None else round(value * 0.86, 2),
                high=None if value is None else round(value * 1.14, 2),
            )
        )
    return series
