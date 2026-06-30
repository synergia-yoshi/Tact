from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field

from app.domain.allocation import allocate_media_budget
from app.domain.benchmarks import load_benchmarks
from app.domain.uncertainty import EstimateInterval, prediction_interval
from app.models.estimation import EstimateRange
from app.models.measurement import MetricSeriesPoint, MetricSnapshot


class MeasurementReadRequest(BaseModel):
    org_id: str
    campaign_id: str
    campaign_name: str
    total_budget_jpy: int = Field(gt=0)
    objective: str = "conversion"
    target_audience: str = ""
    channels: list[str] = Field(default_factory=lambda: ["search", "social", "display"])
    brand_factor: float = Field(default=1.0, gt=0, le=2.0)


class MeasurementAdapter(ABC):
    @abstractmethod
    async def fetch_snapshot(self, request: MeasurementReadRequest) -> MetricSnapshot:
        """Fetch read-only measurement data before any outbound media mutation."""


class MockMeasurementAdapter(MeasurementAdapter):
    async def fetch_snapshot(self, request: MeasurementReadRequest) -> MetricSnapshot:
        store = load_benchmarks()
        delivery_budget = max(
            1,
            round(request.total_budget_jpy * store.measurement_delivery_ratio()),
        )
        allocation = allocate_media_budget(
            total_budget_jpy=delivery_budget,
            channels=request.channels,
            objective=request.objective,
            target_audience=request.target_audience,
            campaign_name=request.campaign_name,
            month=datetime.now(tz=UTC).month,
            brand_factor=request.brand_factor,
            store=store,
        )
        sessions = max(1, round(sum(item.simulation.sessions for item in allocation.items)))
        conversions = max(1, round(allocation.estimated_conversions))
        orders = max(1, round(conversions))
        revenue = max(1, round(allocation.estimated_revenue_jpy))
        ad_spend = delivery_budget
        cpa = round(ad_spend / conversions, 2)
        roas = round(revenue / ad_spend, 2)
        representative = allocation.items[0].simulation.assumption
        n = sum(item.simulation.assumption.n for item in allocation.items)
        confidence_seed = allocation.cpa_range.confidence
        conversions_range = prediction_interval(
            conversions,
            store=store,
            source=representative.source,
            n=n,
            confidence_seed=confidence_seed,
        )
        roas_range = prediction_interval(
            roas,
            store=store,
            source=representative.source,
            n=n,
            confidence_seed=confidence_seed,
        )
        confidence = round((allocation.cpa_range.confidence + conversions_range.confidence) / 2, 4)
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
            cpa_jpy_range=_range_from_interval(allocation.cpa_range),
            roas=roas,
            roas_range=_range_from_interval(roas_range),
            conversions_range=_range_from_interval(conversions_range),
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
                    points=store.measurement_series_points(),
                    gap_index=store.measurement_missing_index(),
                    confidence=confidence,
                )
            },
            measured_at=measured_at,
        )


def _range_from_interval(interval: EstimateInterval) -> EstimateRange:
    return EstimateRange(
        low=round(interval.low, 2),
        high=round(interval.high, 2),
        confidence=round(interval.confidence, 4),
        source="model",
    )


def _mock_series(
    *,
    measured_at: datetime,
    total: int,
    points: int,
    gap_index: int,
    confidence: float,
) -> list[MetricSeriesPoint]:
    daily_base = max(1, total // max(1, points - 1))
    series: list[MetricSeriesPoint] = []
    for index in range(points):
        timestamp = measured_at - timedelta(days=points - 1 - index)
        value: float | None
        if index == gap_index:
            value = None
        else:
            trend = 0.85 + (index / max(1, points - 1)) * 0.30
            value = max(1, round(daily_base * trend))
        interval_width = max(0.08, (1 - confidence) * 0.35)
        series.append(
            MetricSeriesPoint(
                timestamp=timestamp,
                value=value,
                data_kind="simulated",
                source="ga4_shopify_mock",
                low=None if value is None else round(value * (1 - interval_width), 2),
                high=None if value is None else round(value * (1 + interval_width), 2),
            )
        )
    return series
