from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator

from app.adapters.media import MediaPlanResponse


CampaignStatus = Literal["proposed", "scheduled", "published"]


class CampaignBrief(BaseModel):
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


class CampaignProposal(BaseModel):
    id: str = Field(default_factory=lambda: f"cmp_{uuid4().hex}")
    brief: CampaignBrief
    creative: CreativeDraft
    media_plan: MediaPlanResponse
    status: CampaignStatus = "proposed"
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
