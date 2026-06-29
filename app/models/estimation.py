from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

EstimateSource = Literal["mock", "model", "measured"]


class EstimateRange(BaseModel):
    low: float = Field(ge=0)
    high: float = Field(ge=0)
    confidence: float | None = Field(default=None, ge=0, le=1)
    source: EstimateSource

    @model_validator(mode="after")
    def validate_range(self) -> EstimateRange:
        if self.high < self.low:
            raise ValueError("high must be greater than or equal to low")
        return self
