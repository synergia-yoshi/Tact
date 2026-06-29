from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.estimation import EstimateRange
from app.models.measurement import MetricDataKind, MetricSeriesPoint, MetricSource

DashboardPeriod = Literal["7d", "28d", "all"]
DashboardChannelFilter = Literal["all", "search", "social", "display"]
DashboardMetricKey = Literal[
    "planned_budget_jpy",
    "ad_spend_jpy",
    "roas",
    "cpa_jpy",
    "conversions",
    "revenue_jpy",
]
DashboardMetricUnit = Literal["jpy", "ratio", "count"]
DashboardMetricStatus = Literal["available", "measurement_pending", "not_applicable"]
ChannelDeliveryStatus = Literal["pending", "active", "stopped", "test"]
KillSwitchDashboardStatus = Literal["not_checked", "clear", "would_stop", "stopped"]


class DashboardMetric(BaseModel):
    key: DashboardMetricKey
    label: str
    value: float | None = None
    unit: DashboardMetricUnit
    status: DashboardMetricStatus = "available"
    data_kind: MetricDataKind | None = None
    source: MetricSource | None = None
    estimate_range: EstimateRange | None = None
    series: list[MetricSeriesPoint] = Field(default_factory=list)


class ChannelDashboardRow(BaseModel):
    channel: str
    label: str
    status: ChannelDeliveryStatus
    planned_budget_jpy: DashboardMetric
    ad_spend_jpy: DashboardMetric
    roas: DashboardMetric
    cpa_jpy: DashboardMetric
    conversions: DashboardMetric
    series: list[MetricSeriesPoint] = Field(default_factory=list)


class ImprovementCycle(BaseModel):
    stage: Literal["brief", "creative", "measurement", "publish", "improvement"]
    title: str
    changed: str
    result: str
    source: MetricSource | None = None
    data_kind: MetricDataKind | None = None
    occurred_at: datetime
    evidence_event_type: str | None = None


class KillSwitchDashboardState(BaseModel):
    status: KillSwitchDashboardStatus
    label: str
    reason: str
    data_kind: MetricDataKind | None = None
    source: MetricSource | None = None
    checked_at: datetime | None = None


class CampaignDashboard(BaseModel):
    campaign_id: str
    campaign_name: str
    period: DashboardPeriod
    channel_filter: DashboardChannelFilter
    kpis: list[DashboardMetric]
    channels: list[ChannelDashboardRow]
    improvement_cycles: list[ImprovementCycle]
    kill_switch: KillSwitchDashboardState
    generated_at: datetime
