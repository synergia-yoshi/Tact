from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.domain.benchmarks import BenchmarkStore, ChannelAssumption, load_benchmarks
from app.domain.pipeline import PipelineResult, calculate_pipeline


@dataclass(frozen=True)
class SaturationEvidence:
    concave_cap: float
    concave_k: float
    frequency_reach_cap: float
    search_cap: float | None
    applied: list[str]


@dataclass(frozen=True)
class ChannelSimulation:
    channel: str
    channel_class: str
    media: str
    spend_jpy: float
    impressions: float
    reach: float
    clicks: float
    sessions: float
    conversions: float
    revenue_jpy: float
    cpa_jpy: float
    roas: float
    aov_jpy: float
    assumption: ChannelAssumption
    saturation: SaturationEvidence
    source: dict[str, object]
    formula: str
    warnings: list[str] = field(default_factory=list)
    pipeline: PipelineResult | None = None


def simulate_channel(
    *,
    spend_jpy: float,
    channel: str,
    objective: str,
    industry: str | None = None,
    month: int | None = None,
    scenario: str = "standard",
    brand_factor: float = 1.0,
    metric_overrides: dict[str, float] | None = None,
    store: BenchmarkStore | None = None,
) -> ChannelSimulation:
    store = store or load_benchmarks()
    assumption = store.assumption_for(channel=channel, objective=objective, industry=industry)
    metrics = dict(assumption.metrics)
    metrics.update(metric_overrides or {})
    scenario_multipliers = store.scenario_multipliers(scenario)
    seasonality, seasonality_source = store.seasonality_factor(assumption.industry, month)

    cpm = max(1e-9, metrics["cpm"] * scenario_multipliers.get("cpm", 1.0))
    ctr = max(0.0, metrics["ctr"] * scenario_multipliers.get("ctr", 1.0) * brand_factor)
    base_cvr = max(0.0, metrics["cvr"] * scenario_multipliers.get("cvr", 1.0) * seasonality)
    aov = max(0.0, metrics["aov"] * scenario_multipliers.get("aov", 1.0))
    frequency = max(1e-9, metrics["frequency"])
    audience_size = max(1.0, metrics["audience_size"])

    spend = max(0.0, spend_jpy)
    impressions = spend / cpm * 1000
    reach = _frequency_saturated_reach(
        impressions=impressions,
        frequency=frequency,
        audience_size=audience_size,
    )
    effective_impressions = min(impressions, reach * frequency)
    clicks = effective_impressions * ctr
    sessions = clicks
    pipeline = None
    if objective == "lead_generation" or assumption.industry == "btob_saas":
        pipeline = calculate_pipeline(sessions=sessions, store=store)
        unsaturated_conversions = pipeline.leads
        revenue = pipeline.wins * aov
        effective_cvr = pipeline.form_cvr
    else:
        unsaturated_conversions = sessions * base_cvr
        revenue = unsaturated_conversions * aov
        effective_cvr = base_cvr

    saturated_conversions, saturation = _apply_saturation(
        spend=spend,
        unsaturated_conversions=unsaturated_conversions,
        cvr=effective_cvr,
        audience_size=audience_size,
        response_k_ratio=metrics["response_k_ratio"],
        channel_class=assumption.channel_class,
        search_demand_conversions=metrics["search_demand_conversions"],
        search_is_cap=metrics["search_is_cap"],
        frequency_reach_cap=audience_size,
    )
    if unsaturated_conversions > 0:
        revenue *= saturated_conversions / unsaturated_conversions
    cpa = spend / saturated_conversions if saturated_conversions > 0 else spend
    roas = revenue / spend if spend > 0 else 0
    source = {
        "benchmark": assumption.source_payload(),
        "metric_sources": assumption.metric_sources,
        "engine_defaults": assumption.source_payload()["engine_default_metrics"],
        "seasonality": seasonality_source,
        "scenario": scenario,
        "objective": objective,
        "brand_factor": brand_factor,
        "overrides": sorted((metric_overrides or {}).keys()),
        "data_kind": assumption.source.data_kind,
        "formula": (
            "imp=spend/CPM*1000; reach=frequency saturation; clicks=imp*CTR; "
            "CV=sessions*CVR; revenue=CV*AOV"
        ),
    }
    return ChannelSimulation(
        channel=channel,
        channel_class=assumption.channel_class,
        media=assumption.media,
        spend_jpy=spend,
        impressions=impressions,
        reach=reach,
        clicks=clicks,
        sessions=sessions,
        conversions=saturated_conversions,
        revenue_jpy=revenue,
        cpa_jpy=cpa,
        roas=roas,
        aov_jpy=aov,
        assumption=assumption,
        saturation=saturation,
        source=source,
        formula=str(source["formula"]),
        warnings=list(assumption.notes),
        pipeline=pipeline,
    )


def validate_simulation(result: ChannelSimulation) -> list[str]:
    errors: list[str] = []
    if result.conversions < 0 or result.revenue_jpy < 0:
        errors.append("metrics must be non-negative")
    if result.conversions > 0 and not math.isclose(
        result.cpa_jpy,
        result.spend_jpy / result.conversions,
        rel_tol=0.02,
    ):
        errors.append("CPA does not match spend / conversions")
    if result.spend_jpy > 0 and not math.isclose(
        result.roas,
        result.revenue_jpy / result.spend_jpy,
        rel_tol=0.02,
    ):
        errors.append("ROAS does not match revenue / spend")
    if "benchmark" not in result.source:
        errors.append("source is required")
    return errors


def _frequency_saturated_reach(
    *,
    impressions: float,
    frequency: float,
    audience_size: float,
) -> float:
    if impressions <= 0:
        return 0
    return audience_size * (1 - math.exp(-impressions / (audience_size * frequency)))


def _apply_saturation(
    *,
    spend: float,
    unsaturated_conversions: float,
    cvr: float,
    audience_size: float,
    response_k_ratio: float,
    channel_class: str,
    search_demand_conversions: float,
    search_is_cap: float,
    frequency_reach_cap: float,
) -> tuple[float, SaturationEvidence]:
    if spend <= 0 or unsaturated_conversions <= 0:
        return 0, SaturationEvidence(0, 0, frequency_reach_cap, None, [])
    slope = unsaturated_conversions / spend
    concave_cap = max(1.0, audience_size * max(cvr, 1e-9))
    concave_k = max(1.0, (concave_cap / max(slope, 1e-12)) * response_k_ratio)
    concave_conversions = concave_cap * (1 - math.exp(-spend / concave_k))
    applied = ["concave_response", "frequency_reach"]
    conversions = min(unsaturated_conversions, concave_conversions)
    search_cap: float | None = None
    if channel_class == "search" and math.isfinite(search_demand_conversions):
        search_cap = max(0.0, search_demand_conversions * search_is_cap)
        conversions = min(conversions, search_cap)
        applied.append("search_impression_share_cap")
    return conversions, SaturationEvidence(
        concave_cap=concave_cap,
        concave_k=concave_k,
        frequency_reach_cap=frequency_reach_cap,
        search_cap=search_cap,
        applied=applied,
    )
