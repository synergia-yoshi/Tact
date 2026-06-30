from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

LegalCheckStatus = Literal["passed", "needs_review", "blocked"]
LegalSeverity = Literal["info", "warning", "blocking"]


class LegalFinding(BaseModel):
    rule_id: str
    category: str
    severity: LegalSeverity
    matched_text: str
    normalized_term: str
    message: str
    rationale: str


class LegalCheckResult(BaseModel):
    id: str = Field(default_factory=lambda: f"leg_{uuid4().hex}")
    status: LegalCheckStatus
    source: Literal["rule_based"] = "rule_based"
    findings: list[LegalFinding] = Field(default_factory=list)
    checked_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
