from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class AuditEntry(BaseModel):
    id: str = Field(default_factory=lambda: f"aud_{uuid4().hex}")
    event_type: str
    actor: str
    subject_type: str
    subject_id: str
    summary: str
    payload: dict[str, Any] = Field(default_factory=dict)
    diff: dict[str, Any] = Field(default_factory=dict)
    guardrail_result: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    prev_hash: str | None = None
    hash: str

    @classmethod
    def create(
        cls,
        *,
        event_type: str,
        actor: str,
        subject_type: str,
        subject_id: str,
        summary: str,
        payload: dict[str, Any] | None = None,
        diff: dict[str, Any] | None = None,
        guardrail_result: dict[str, Any] | None = None,
        prev_hash: str | None = None,
    ) -> AuditEntry:
        entry = cls(
            event_type=event_type,
            actor=actor,
            subject_type=subject_type,
            subject_id=subject_id,
            summary=summary,
            payload=payload or {},
            diff=diff or {},
            guardrail_result=guardrail_result or {},
            prev_hash=prev_hash,
            hash="",
        )
        return entry.model_copy(update={"hash": entry.compute_hash()})

    def compute_hash(self) -> str:
        payload = self.model_dump(mode="json", exclude={"hash"})
        canonical = json.dumps(
            payload,
            ensure_ascii=True,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def has_valid_hash(self) -> bool:
        return self.hash == self.compute_hash()


class AuditVerificationResult(BaseModel):
    valid: bool
    entries_checked: int
    broken_entry_id: str | None = None
    reason: str | None = None
