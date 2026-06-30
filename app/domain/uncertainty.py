from __future__ import annotations

import math
from dataclasses import dataclass

from app.domain.benchmarks import CURRENT_YEAR, BenchmarkSource, BenchmarkStore


@dataclass(frozen=True)
class EstimateInterval:
    point: float
    low: float
    high: float
    confidence: float
    source: dict[str, object]
    explanation: str

    def as_range_payload(self) -> dict[str, float | str]:
        return {
            "low": round(self.low, 2),
            "high": round(self.high, 2),
            "confidence": round(self.confidence, 4),
            "source": "model",
        }


def prediction_interval(
    point: float,
    *,
    store: BenchmarkStore,
    source: BenchmarkSource,
    n: int = 1,
    sd: float | None = None,
    confidence_seed: float | None = None,
) -> EstimateInterval:
    point = max(0.0, float(point))
    scoped_n = max(1, int(n))
    confidence = confidence_score(
        store=store,
        source=source,
        n=scoped_n,
        confidence_seed=confidence_seed,
    )
    if point == 0:
        return EstimateInterval(
            point=0,
            low=0,
            high=0,
            confidence=confidence,
            source=source.as_dict(),
            explanation="point is zero; interval remains zero",
        )

    relative_sd = _relative_sd(point=point, sd=sd, confidence=confidence)
    staleness_multiplier = _staleness_interval_multiplier(store=store, source=source)
    standard_error = point * relative_sd / math.sqrt(scoped_n)
    width = 1.96 * standard_error * staleness_multiplier
    # Industry seeds with n=1 should stay visibly broad, even when a source has no sd.
    minimum_width = point * _minimum_relative_width(
        store=store,
        source=source,
        confidence=confidence,
    )
    width = max(width, minimum_width)
    return EstimateInterval(
        point=point,
        low=max(0.0, point - width),
        high=point + width,
        confidence=confidence,
        source=source.as_dict(),
        explanation=(
            "95% prediction interval from benchmark sd/confidence, sample size, "
            "and staleness"
        ),
    )


def confidence_score(
    *,
    store: BenchmarkStore,
    source: BenchmarkSource,
    n: int,
    confidence_seed: float | None = None,
) -> float:
    base = confidence_seed if confidence_seed is not None else store.confidence_base(source.type)
    sample_gain = 1 - math.exp(-max(1, n) / 30)
    staleness = _staleness_confidence_multiplier(store=store, source=source)
    score = (0.75 * base + 0.25 * sample_gain) * staleness
    return max(0.05, min(0.95, score))


def _relative_sd(*, point: float, sd: float | None, confidence: float) -> float:
    if sd is not None and sd > 0:
        if sd < 1 and point > 1:
            return max(0.03, sd)
        return max(0.03, sd / point)
    return max(0.08, (1 - confidence) * 0.80)


def _minimum_relative_width(
    *,
    store: BenchmarkStore,
    source: BenchmarkSource,
    confidence: float,
) -> float:
    base = 0.10 if source.type == "actual" else 0.25
    latest_year = source.latest_year
    age = 6 if latest_year is None else max(0, CURRENT_YEAR - latest_year)
    age_extra = min(0.35, age / max(1.0, store.staleness_halflife_years()) * 0.08)
    confidence_extra = (1 - confidence) * 0.18
    return min(0.85, max(0.08, base + age_extra + confidence_extra))


def _staleness_interval_multiplier(*, store: BenchmarkStore, source: BenchmarkSource) -> float:
    latest_year = source.latest_year
    if latest_year is None:
        return 1.25
    age = max(0, CURRENT_YEAR - latest_year)
    halflife = max(1.0, store.staleness_halflife_years())
    return 1 + (age / halflife) * 0.35


def _staleness_confidence_multiplier(*, store: BenchmarkStore, source: BenchmarkSource) -> float:
    latest_year = source.latest_year
    if latest_year is None:
        return 0.85
    age = max(0, CURRENT_YEAR - latest_year)
    halflife = max(1.0, store.staleness_halflife_years())
    return 0.5 ** (age / (halflife * 2))
