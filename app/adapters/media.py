from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

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
    """Deterministic media API adapter for MVP development."""

    async def create_plan(self, request: MediaPlanRequest) -> MediaPlanResponse:
        channels = request.channels or ["search", "social"]
        base_budget = request.total_budget_jpy // len(channels)
        remainder = request.total_budget_jpy % len(channels)

        placements: list[MediaPlacement] = []
        for index, channel in enumerate(channels):
            budget = base_budget + (remainder if index == 0 else 0)
            placements.append(
                MediaPlacement(
                    channel=channel,
                    budget_jpy=budget,
                    objective=request.objective,
                    targeting={
                        "audience": request.target_audience,
                        "keywords": [request.objective, channel, "mvp"],
                    },
                    creative_spec={
                        "format": "responsive",
                        "primary_text_max_chars": "120",
                        "asset_policy": "mock-validation-only",
                    },
                )
            )

        estimated_reach = max(1000, request.total_budget_jpy * 3)
        estimated_cpa = max(100, request.total_budget_jpy // 120)
        channel_uncertainty = min(0.28, 0.16 + (0.02 * max(0, len(channels) - 1)))

        return MediaPlanResponse(
            request_id=f"media_plan_mock_{uuid4().hex}",
            account_id=request.account_id,
            placements=placements,
            estimated_reach=estimated_reach,
            estimated_reach_range=_estimate_range(
                estimated_reach,
                uncertainty=channel_uncertainty,
                confidence=0.58,
            ),
            estimated_cpa_jpy=estimated_cpa,
            estimated_cpa_jpy_range=_estimate_range(
                estimated_cpa,
                uncertainty=channel_uncertainty + 0.04,
                confidence=0.54,
            ),
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


def _estimate_range(value: float, *, uncertainty: float, confidence: float) -> EstimateRange:
    return EstimateRange(
        low=round(value * (1 - uncertainty), 2),
        high=round(value * (1 + uncertainty), 2),
        confidence=confidence,
        source="mock",
    )
