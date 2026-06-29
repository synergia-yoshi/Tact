from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod

from pydantic import BaseModel, Field

from app.models.estimation import EstimateRange
from app.models.measurement import MetricSnapshot


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
        )


def _estimate_range(value: float, *, uncertainty: float, confidence: float) -> EstimateRange:
    return EstimateRange(
        low=round(value * (1 - uncertainty), 2),
        high=round(value * (1 + uncertainty), 2),
        confidence=confidence,
        source="mock",
    )
