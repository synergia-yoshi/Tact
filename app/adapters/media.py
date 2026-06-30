from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from app.domain.allocation import AllocationResult, allocate_media_budget
from app.models.estimation import EstimateRange


class MediaPlacement(BaseModel):
    channel: str
    budget_jpy: int = Field(ge=0)
    objective: str
    targeting: dict[str, str | list[str]]
    creative_spec: dict[str, str]


class MediaPlanRequest(BaseModel):
    """Real media API style request for planning placements."""

    account_id: str
    campaign_name: str
    objective: str
    total_budget_jpy: int = Field(gt=0)
    target_audience: str
    channels: list[str]


class MediaPlanResponse(BaseModel):
    request_id: str
    account_id: str
    source: Literal["mock", "model"] = "mock"
    placements: list[MediaPlacement]
    estimated_reach: int
    estimated_reach_range: EstimateRange | None = None
    estimated_cpa_jpy: int
    estimated_cpa_jpy_range: EstimateRange | None = None
    generated_at: datetime


class MediaPublishRequest(BaseModel):
    account_id: str
    campaign_id: str
    placements: list[MediaPlacement]
    creative: dict[str, str]


class MediaPublishResponse(BaseModel):
    request_id: str
    external_campaign_id: str
    status: Literal["draft", "scheduled", "published", "failed"]
    review_url: str | None = None
    submitted_at: datetime


class MediaPerformanceRequest(BaseModel):
    account_id: str
    external_campaign_id: str


class MediaPerformanceResponse(BaseModel):
    external_campaign_id: str
    impressions: int
    clicks: int
    conversions: int
    spend_jpy: int
    measured_at: datetime


class MediaDeliveryStatusRequest(BaseModel):
    account_id: str
    external_campaign_id: str


class MediaDeliveryStatusResponse(BaseModel):
    external_campaign_id: str
    active: bool
    health: Literal["healthy", "degraded", "stopped", "unknown"]
    data_kind: Literal["measured", "simulated"]
    checked_at: datetime


class MediaAdapter(ABC):
    @abstractmethod
    async def create_plan(self, request: MediaPlanRequest) -> MediaPlanResponse:
        """Create a media plan using the same boundary shape as a real media API."""

    @abstractmethod
    async def publish_campaign(self, request: MediaPublishRequest) -> MediaPublishResponse:
        """Submit a campaign using the same boundary shape as a real media API."""

    @abstractmethod
    async def get_performance(
        self, request: MediaPerformanceRequest
    ) -> MediaPerformanceResponse:
        """Fetch campaign performance using the same boundary shape as a real media API."""

    @abstractmethod
    async def get_delivery_status(
        self, request: MediaDeliveryStatusRequest
    ) -> MediaDeliveryStatusResponse:
        """Fetch delivery status for kill-switch evaluation."""


class MockMediaAdapter(MediaAdapter):
    """Deterministic media API adapter backed by the pure domain engine."""

    async def create_plan(self, request: MediaPlanRequest) -> MediaPlanResponse:
        channels = request.channels or ["search", "social"]
        allocation = allocate_media_budget(
            total_budget_jpy=request.total_budget_jpy,
            channels=channels,
            objective=request.objective,
            target_audience=request.target_audience,
            campaign_name=request.campaign_name,
            month=datetime.now(tz=UTC).month,
        )

        placements: list[MediaPlacement] = []
        for item in allocation.items:
            benchmark = item.simulation.assumption.source_payload()
            placements.append(
                MediaPlacement(
                    channel=item.channel,
                    budget_jpy=item.budget_jpy,
                    objective=request.objective,
                    targeting={
                        "audience": request.target_audience,
                        "industry": allocation.industry,
                        "media": item.simulation.media,
                        "funnel_stage": item.simulation.assumption.funnel_stage,
                        "keywords": [
                            request.campaign_name,
                            request.objective,
                            _optimization_metric(request.objective),
                            item.channel,
                        ],
                    },
                    creative_spec={
                        "format": "responsive",
                        "primary_text_max_chars": "120",
                        "asset_policy": "validation-only",
                        "optimization_metric": _optimization_metric(request.objective),
                        "bid_strategy": _bid_strategy(request.objective),
                        "bullseye_status": item.bullseye_status,
                        "source_file": str(benchmark["file"]),
                        "source_type": str(benchmark["type"]),
                        "rationale": " / ".join(item.reasons),
                        "warnings": " / ".join(item.warnings),
                    },
                )
            )

        return MediaPlanResponse(
            request_id=f"media_plan_model_{uuid4().hex}",
            account_id=request.account_id,
            source="model",
            placements=placements,
            estimated_reach=max(0, round(allocation.estimated_reach)),
            estimated_reach_range=_range_from_interval(allocation, metric="reach"),
            estimated_cpa_jpy=max(0, round(allocation.estimated_cpa_jpy)),
            estimated_cpa_jpy_range=_range_from_interval(allocation, metric="cpa"),
            generated_at=datetime.now(tz=UTC),
        )

    async def publish_campaign(self, request: MediaPublishRequest) -> MediaPublishResponse:
        fingerprint = hashlib.sha256(
            f"{request.account_id}:{request.campaign_id}".encode()
        ).hexdigest()[:12]
        return MediaPublishResponse(
            request_id=f"media_publish_mock_{uuid4().hex}",
            external_campaign_id=f"mock_media_{fingerprint}",
            status="scheduled",
            review_url=f"https://mock.media.local/campaigns/{fingerprint}",
            submitted_at=datetime.now(tz=UTC),
        )

    async def get_performance(
        self, request: MediaPerformanceRequest
    ) -> MediaPerformanceResponse:
        seed = int(hashlib.sha256(request.external_campaign_id.encode("utf-8")).hexdigest()[:6], 16)
        impressions = 10_000 + seed % 50_000
        clicks = max(1, impressions // 33)
        conversions = max(1, clicks // 20)
        spend = conversions * 850
        return MediaPerformanceResponse(
            external_campaign_id=request.external_campaign_id,
            impressions=impressions,
            clicks=clicks,
            conversions=conversions,
            spend_jpy=spend,
            measured_at=datetime.now(tz=UTC),
        )

    async def get_delivery_status(
        self, request: MediaDeliveryStatusRequest
    ) -> MediaDeliveryStatusResponse:
        return MediaDeliveryStatusResponse(
            external_campaign_id=request.external_campaign_id,
            active=True,
            health="healthy",
            data_kind="simulated",
            checked_at=datetime.now(tz=UTC),
        )


def _range_from_interval(
    allocation: AllocationResult,
    *,
    metric: Literal["reach", "cpa"],
) -> EstimateRange:
    interval = allocation.reach_range if metric == "reach" else allocation.cpa_range
    return EstimateRange(
        low=round(interval.low, 2),
        high=round(interval.high, 2),
        confidence=round(interval.confidence, 4),
        source="model",
    )


def _optimization_metric(objective: str) -> str:
    return {
        "conversion": "conversion_value",
        "lead_generation": "qualified_leads",
        "traffic": "clicks",
        "awareness": "reach",
        "local_visits": "store_visits",
        "app_promotion": "installs",
        "efficiency": "cpa_jpy",
    }.get(objective, "conversions")


def _bid_strategy(objective: str) -> str:
    return {
        "conversion": "target_roas",
        "lead_generation": "target_cpa",
        "traffic": "maximize_clicks",
        "awareness": "target_cpm",
        "local_visits": "maximize_conversions",
        "app_promotion": "target_cpa",
        "efficiency": "target_cpa",
    }.get(objective, "maximize_conversions")
