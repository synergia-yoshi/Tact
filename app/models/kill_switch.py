from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class KillSwitchResult(BaseModel):
    id: str = Field(default_factory=lambda: f"kil_{uuid4().hex}")
    status: Literal["clear", "would_stop", "stopped"]
    data_kind: Literal["measured", "simulated"]
    reason: str
    media_status: dict
    checked_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
