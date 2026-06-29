from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.adapters.media import MediaPlanResponse, MediaPublishResponse
from app.models.legal import LegalCheckResult
from app.models.measurement import MetricSnapshot

CampaignStatus = Literal["proposed", "draft", "scheduled", "published", "failed"]
ApprovalStatus = Literal["pending_approval", "approved", "rejected"]


class CampaignBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    objective: str = Field(min_length=1, max_length=80)
    target_audience: str = Field(min_length=1, max_length=240)
    total_budget_jpy: int = Field(gt=0)
    channels: list[str] = Field(min_length=1)
    start_date: date | None = None
    end_date: date | None = None
    kpis: list[str] = Field(default_factory=list)
    tone: str = Field(default="clear and practical", max_length=120)

    @model_validator(mode="after")
    def validate_dates(self) -> CampaignBrief:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class CreativeDraft(BaseModel):
    headline: str
    body: str
    call_to_action: str
    hashtags: list[str] = Field(default_factory=list)
    compliance_notes: list[str] = Field(default_factory=list)


class AgentAction(BaseModel):
    id: str = Field(default_factory=lambda: f"act_{uuid4().hex}")
    kind: Literal["publish_campaign"]
    payload: dict
    guardrail_result: dict
    approval_status: ApprovalStatus = "pending_approval"
    execution_result: dict | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class CampaignProposal(BaseModel):
    id: str = Field(default_factory=lambda: f"cmp_{uuid4().hex}")
    org_id: str = "dev-org"
    created_by: str = "dev-user"
    brief: CampaignBrief
    creative: CreativeDraft
    media_plan: MediaPlanResponse
    metric_snapshots: list[MetricSnapshot] = Field(default_factory=list)
    legal_checks: list[LegalCheckResult] = Field(default_factory=list)
    actions: list[AgentAction] = Field(default_factory=list)
    publish_result: MediaPublishResponse | None = None
    status: CampaignStatus = "proposed"
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
