from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field

from app.policy import RoleName


class RoleAssignment(BaseModel):
    actor_id: str
    display_name: str
    roles: list[RoleName] = Field(min_length=1)
    surface: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class RoleAssignmentUpdate(BaseModel):
    roles: list[RoleName] = Field(min_length=1)
