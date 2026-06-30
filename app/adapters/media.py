from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass
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


@dataclass(frozen=True)
class ObjectiveStrategy:
    channel_weights: dict[str, int]
    optimization_metric: str
    bid_strategy: str
    reach_multiplier: float
    cpa_divisor: int


_DEFAULT_OBJECTIVE_STRATEGY = ObjectiveStrategy(
    channel_weights={"search": 40, "social": 35, "display": 25},
    optimization_metric="conversions",
    bid_strategy="maximize_conversions",
    reach_multiplier=3.0,
    cpa_divisor=120,
)

_OBJECTIVE_STRATEGIES = {
    "conversion": ObjectiveStrategy(
        channel_weights={"search": 45, "social": 35, "display": 20},
        optimization_metric="conversion_value",
        bid_strategy="target_roas",
        reach_multiplier=2.7,
        cpa_divisor=105,
    ),
    "lead_generation": ObjectiveStrategy(
        channel_weights={"search": 50, "social": 35, "display": 15},
        optimization_metric="qualified_leads",
        bid_strategy="target_cpa",
        reach_multiplier=2.8,
        cpa_divisor=130,
    ),
    "traffic": ObjectiveStrategy(
        channel_weights={"search": 40, "display": 35, "social": 25},
        optimization_metric="clicks",
        bid_strategy="maximize_clicks",
        reach_multiplier=4.2,
        cpa_divisor=170,
    ),
    "awareness": ObjectiveStrategy(
        channel_weights={"display": 50, "social": 35, "search": 15},
        optimization_metric="reach",
        bid_strategy="target_cpm",
        reach_multiplier=5.4,
        cpa_divisor=220,
    ),
    "local_visits": ObjectiveStrategy(
        channel_weights={"search": 55, "display": 30, "social": 15},
        optimization_metric="store_visits",
        bid_strategy="maximize_conversions",
        reach_multiplier=3.1,
        cpa_divisor=115,
    ),
    "app_promotion": ObjectiveStrategy(
        channel_weights={"social": 50, "display": 30, "search": 20},
        optimization_metric="installs",
        bid_strategy="target_cpa",
        reach_multiplier=3.8,
        cpa_divisor=145,
    ),
    "efficiency": ObjectiveStrategy(
        channel_weights={"search": 45, "social": 30, "display": 25},
        optimization_metric="cpa_jpy",
        bid_strategy="target_cpa",
        reach_multiplier=2.6,
        cpa_divisor=150,
    ),
}


class MockMediaAdapter(MediaAdapter):
    """Deterministic media API adapter for MVP development."""

    async def create_plan(self, request: MediaPlanRequest) -> MediaPlanResponse:
        channels = request.channels or ["search", "social"]
        strategy = _objective_strategy(request.objective)
        budgets = _allocate_budget(
            request.total_budget_jpy,
            channels,
            strategy.channel_weights,
        )

        placements: list[MediaPlacement] = []
        for channel, budget in zip(channels, budgets, strict=True):
            placements.append(
                MediaPlacement(
                    channel=channel,
                    budget_jpy=budget,
                    objective=request.objective,
                    targeting={
                        "audience": request.target_audience,
                        "keywords": [
                            request.campaign_name,
                            request.objective,
                            strategy.optimization_metric,
                            channel,
                        ],
                    },
                    creative_spec={
                        "format": "responsive",
                        "primary_text_max_chars": "120",
                        "asset_policy": "mock-validation-only",
                        "optimization_metric": strategy.optimization_metric,
                        "bid_strategy": strategy.bid_strategy,
                    },
                )
            )

        estimated_reach = max(1000, round(request.total_budget_jpy * strategy.reach_multiplier))
        estimated_cpa = max(100, round(request.total_budget_jpy / strategy.cpa_divisor))
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


def _objective_strategy(objective: str) -> ObjectiveStrategy:
    return _OBJECTIVE_STRATEGIES.get(objective, _DEFAULT_OBJECTIVE_STRATEGY)


def _allocate_budget(
    total_budget_jpy: int,
    channels: list[str],
    weights: dict[str, int],
) -> list[int]:
    if not channels:
        return []
    channel_weights = [max(0, weights.get(channel, 1)) for channel in channels]
    if sum(channel_weights) == 0:
        channel_weights = [1 for _ in channels]
    total_weight = sum(channel_weights)
    raw_allocations = [
        (total_budget_jpy * weight) / total_weight for weight in channel_weights
    ]
    budgets = [int(allocation) for allocation in raw_allocations]
    remainder = total_budget_jpy - sum(budgets)
    fractional_order = sorted(
        range(len(raw_allocations)),
        key=lambda index: raw_allocations[index] - budgets[index],
        reverse=True,
    )
    for index in fractional_order[:remainder]:
        budgets[index] += 1
    return budgets
