from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.benchmarks import BenchmarkStore, infer_industry, load_benchmarks
from app.domain.simulation import ChannelSimulation, simulate_channel, validate_simulation
from app.domain.uncertainty import EstimateInterval, prediction_interval


@dataclass(frozen=True)
class AllocationItem:
    channel: str
    budget_jpy: int
    simulation: ChannelSimulation
    marginal_score_per_jpy: float
    bullseye_status: str
    reasons: list[str]
    warnings: list[str]
    source: dict[str, object]


@dataclass(frozen=True)
class ScenarioSummary:
    name: str
    conversions: float
    revenue_jpy: float
    cpa_jpy: float
    roas: float
    source: dict[str, object]


@dataclass(frozen=True)
class SensitivitySummary:
    lever: str
    change: str
    conversions_delta: float
    cpa_delta_jpy: float
    next_action: str


@dataclass(frozen=True)
class AllocationResult:
    total_budget_jpy: int
    objective: str
    industry: str
    attribution_model: str
    month: int | None
    items: list[AllocationItem]
    estimated_reach: float
    estimated_conversions: float
    estimated_revenue_jpy: float
    estimated_cpa_jpy: float
    estimated_roas: float
    reach_range: EstimateInterval
    cpa_range: EstimateInterval
    scenarios: list[ScenarioSummary]
    sensitivity: list[SensitivitySummary]
    validations: list[str] = field(default_factory=list)
    source: dict[str, object] = field(default_factory=dict)


def allocate_media_budget(
    *,
    total_budget_jpy: int,
    channels: list[str],
    objective: str,
    target_audience: str = "",
    campaign_name: str = "",
    industry: str | None = None,
    month: int | None = None,
    attribution_model: str = "position_based",
    brand_factor: float = 1.0,
    store: BenchmarkStore | None = None,
) -> AllocationResult:
    store = store or load_benchmarks()
    selected_industry = industry or infer_industry(
        objective=objective,
        target_audience=target_audience,
        campaign_name=campaign_name,
    )
    active_channels = _active_channels(channels, store)
    budgets = _optimize_budgets(
        total_budget_jpy=total_budget_jpy,
        channels=active_channels,
        objective=objective,
        industry=selected_industry,
        month=month,
        attribution_model=attribution_model,
        brand_factor=brand_factor,
        store=store,
    )
    sims = {
        channel: simulate_channel(
            spend_jpy=budget,
            channel=channel,
            objective=objective,
            industry=selected_industry,
            month=month,
            brand_factor=brand_factor,
            store=store,
        )
        for channel, budget in budgets.items()
    }
    marginal_scores = {
        channel: _marginal_score(
            current_budget=budgets[channel],
            step=max(1000, total_budget_jpy // 100),
            channel=channel,
            objective=objective,
            industry=selected_industry,
            month=month,
            attribution_model=attribution_model,
            brand_factor=brand_factor,
            store=store,
        )
        for channel in active_channels
    }
    average_marginal = sum(marginal_scores.values()) / max(1, len(marginal_scores))
    items = [
        AllocationItem(
            channel=channel,
            budget_jpy=budgets[channel],
            simulation=sims[channel],
            marginal_score_per_jpy=marginal_scores[channel],
            bullseye_status=_bullseye_status(marginal_scores[channel], average_marginal),
            reasons=_allocation_reasons(
                sims[channel],
                objective=objective,
                attribution_model=attribution_model,
                store=store,
            ),
            warnings=_feasibility_warnings(sims[channel], store),
            source=sims[channel].source,
        )
        for channel in active_channels
    ]
    totals = _totals(items)
    representative = items[0].simulation.assumption
    reach_range = prediction_interval(
        totals["reach"],
        store=store,
        source=representative.source,
        n=sum(item.simulation.assumption.n for item in items),
        confidence_seed=_weighted_confidence(items),
    )
    cpa_range = prediction_interval(
        totals["cpa"],
        store=store,
        source=representative.source,
        n=sum(item.simulation.assumption.n for item in items),
        confidence_seed=_weighted_confidence(items),
    )
    result = AllocationResult(
        total_budget_jpy=total_budget_jpy,
        objective=objective,
        industry=selected_industry,
        attribution_model=attribution_model,
        month=month,
        items=items,
        estimated_reach=totals["reach"],
        estimated_conversions=totals["conversions"],
        estimated_revenue_jpy=totals["revenue"],
        estimated_cpa_jpy=totals["cpa"],
        estimated_roas=totals["roas"],
        reach_range=reach_range,
        cpa_range=cpa_range,
        scenarios=_scenario_summaries(
            budgets=budgets,
            objective=objective,
            industry=selected_industry,
            month=month,
            brand_factor=brand_factor,
            store=store,
        ),
        sensitivity=_sensitivity_summaries(
            budgets=budgets,
            objective=objective,
            industry=selected_industry,
            month=month,
            baseline=totals,
            brand_factor=brand_factor,
            store=store,
        ),
        source={
            "method": "marginal ROI equalization with saturation, attribution, and seasonality",
            "data_kind": "industry_seed",
            "brand_factor": brand_factor,
            "objective_score_unit_values": store.objective_score_unit_values(),
            "objective_score_unit_source": store.engine_default_source(
                keys=["objective_score_unit_values"]
            ),
        },
    )
    return result.__class__(
        **{
            **result.__dict__,
            "validations": validate_allocation(result),
        }
    )


def validate_allocation(result: AllocationResult) -> list[str]:
    errors: list[str] = []
    budget_sum = sum(item.budget_jpy for item in result.items)
    if budget_sum != result.total_budget_jpy:
        errors.append("allocation total must equal total budget")
    for interval_name, interval, point in [
        ("reach", result.reach_range, result.estimated_reach),
        ("cpa", result.cpa_range, result.estimated_cpa_jpy),
    ]:
        if not (interval.low <= point <= interval.high):
            errors.append(f"{interval_name} interval must contain point estimate")
    for item in result.items:
        errors.extend(validate_simulation(item.simulation))
        if "benchmark" not in item.source:
            errors.append(f"{item.channel} source is required")
    return errors


def _active_channels(channels: list[str], store: BenchmarkStore) -> list[str]:
    scoped = channels or ["search", "social", "display"]
    active: list[str] = []
    for channel in scoped:
        normalized = channel.strip().lower()
        if normalized in store.defunct_media:
            continue
        if normalized not in active:
            active.append(normalized)
    return active or ["search"]


def _optimize_budgets(
    *,
    total_budget_jpy: int,
    channels: list[str],
    objective: str,
    industry: str,
    month: int | None,
    attribution_model: str,
    brand_factor: float,
    store: BenchmarkStore,
) -> dict[str, int]:
    if not channels:
        return {}
    min_budgets = _minimum_test_budgets(
        total_budget_jpy=total_budget_jpy,
        channels=channels,
        objective=objective,
        industry=industry,
        store=store,
    )
    budgets = dict(min_budgets)
    remaining = total_budget_jpy - sum(budgets.values())
    step = max(1000, total_budget_jpy // 100)
    while remaining >= step:
        channel = max(
            channels,
            key=lambda name: _marginal_score(
                current_budget=budgets[name],
                step=step,
                channel=name,
                objective=objective,
                industry=industry,
                month=month,
                attribution_model=attribution_model,
                brand_factor=brand_factor,
                store=store,
            ),
        )
        budgets[channel] += step
        remaining -= step
    if remaining > 0:
        channel = max(
            channels,
            key=lambda name: _marginal_score(
                current_budget=budgets[name],
                step=remaining,
                channel=name,
                objective=objective,
                industry=industry,
                month=month,
                attribution_model=attribution_model,
                brand_factor=brand_factor,
                store=store,
            ),
        )
        budgets[channel] += remaining
    return budgets


def _minimum_test_budgets(
    *,
    total_budget_jpy: int,
    channels: list[str],
    objective: str,
    industry: str,
    store: BenchmarkStore,
) -> dict[str, int]:
    shares = []
    for channel in channels:
        assumption = store.assumption_for(channel=channel, objective=objective, industry=industry)
        shares.append(max(0.0, assumption.metrics["min_test_share"]))
    share_sum = sum(shares)
    scale = min(0.45 / share_sum, 1.0) if share_sum > 0.45 else 1.0
    budgets = {
        channel: int(total_budget_jpy * share * scale)
        for channel, share in zip(channels, shares, strict=True)
    }
    remainder = total_budget_jpy - sum(budgets.values())
    if remainder < 0:
        largest = max(budgets, key=budgets.get)
        budgets[largest] += remainder
    return budgets


def _marginal_score(
    *,
    current_budget: int,
    step: int,
    channel: str,
    objective: str,
    industry: str,
    month: int | None,
    attribution_model: str,
    brand_factor: float,
    store: BenchmarkStore,
) -> float:
    before = simulate_channel(
        spend_jpy=current_budget,
        channel=channel,
        objective=objective,
        industry=industry,
        month=month,
        brand_factor=brand_factor,
        store=store,
    )
    after = simulate_channel(
        spend_jpy=current_budget + step,
        channel=channel,
        objective=objective,
        industry=industry,
        month=month,
        brand_factor=brand_factor,
        store=store,
    )
    weight = store.attribution_weight(before.channel_class, attribution_model)
    return (
        _objective_score(after, store, objective)
        - _objective_score(before, store, objective)
    ) / max(1, step) * weight


def _objective_score(
    simulation: ChannelSimulation,
    store: BenchmarkStore,
    objective: str,
) -> float:
    profile = store.objective_profile(objective)
    aov = max(1.0, simulation.aov_jpy)
    unit_values = store.objective_score_unit_values()
    session_unit = aov * unit_values["sessions_value_ratio"]
    reach_unit = aov * unit_values["reach_value_ratio"]
    return (
        profile.get("value", 0.0) * simulation.revenue_jpy
        + profile.get("conversions", 0.0) * simulation.conversions * aov
        + profile.get("sessions", 0.0) * simulation.sessions * session_unit
        + profile.get("reach", 0.0) * simulation.reach * reach_unit
    )


def _allocation_reasons(
    simulation: ChannelSimulation,
    *,
    objective: str,
    attribution_model: str,
    store: BenchmarkStore,
) -> list[str]:
    weight = store.attribution_weight(simulation.channel_class, attribution_model)
    reasons = [
        f"objective={objective}",
        f"marginal allocation uses {attribution_model} attribution weight {weight:.2f}",
        f"saturation={','.join(simulation.saturation.applied)}",
    ]
    if simulation.source.get("seasonality"):
        seasonality = simulation.source["seasonality"]
        factor = seasonality.get("factor") if isinstance(seasonality, dict) else None
        reasons.append(
            f"seasonality factor considered ({factor:.2f}x)"
            if isinstance(factor, int | float)
            else "seasonality layer considered"
        )
    if simulation.source.get("engine_defaults"):
        defaults = ",".join(str(key) for key in simulation.source["engine_defaults"])
        reasons.append(f"owner-unconfirmed engine defaults used: {defaults}")
    return reasons


def _feasibility_warnings(
    simulation: ChannelSimulation,
    store: BenchmarkStore,
) -> list[str]:
    thresholds = store.feasibility_thresholds()
    warnings = list(simulation.warnings)
    if simulation.channel_class == "social":
        minimum = thresholds.get("facebook_min_cv_per_week", 50)
        seed = thresholds.get("lookalike_min_seed", 100)
        if simulation.conversions < minimum:
            warnings.append("learning volume below FB 50 CV/week; reliability is low")
        if simulation.conversions < seed:
            warnings.append("lookalike seed below 100; start broad before 1% lookalike")
    if simulation.channel_class == "search" and simulation.saturation.search_cap is not None:
        if simulation.conversions >= simulation.saturation.search_cap * 0.9:
            warnings.append("search demand is close to impression-share cap")
    if simulation.channel_class == "display" and simulation.reach > 0:
        frequency = simulation.impressions / simulation.reach
        if frequency > thresholds.get("display_max_frequency", 7):
            warnings.append("display frequency is high; incremental reach is saturating")
    return warnings


def _bullseye_status(marginal: float, average: float) -> str:
    if average <= 0:
        return "検証中"
    if marginal >= average * 1.15:
        return "勝ち筋"
    if marginal <= average * 0.70:
        return "負け筋"
    return "検証中"


def _totals(items: list[AllocationItem]) -> dict[str, float]:
    spend = sum(item.budget_jpy for item in items)
    reach = sum(item.simulation.reach for item in items)
    conversions = sum(item.simulation.conversions for item in items)
    revenue = sum(item.simulation.revenue_jpy for item in items)
    return {
        "spend": spend,
        "reach": reach,
        "conversions": conversions,
        "revenue": revenue,
        "cpa": spend / conversions if conversions > 0 else float(spend),
        "roas": revenue / spend if spend > 0 else 0,
    }


def _scenario_summaries(
    *,
    budgets: dict[str, int],
    objective: str,
    industry: str,
    month: int | None,
    brand_factor: float,
    store: BenchmarkStore,
) -> list[ScenarioSummary]:
    summaries: list[ScenarioSummary] = []
    for name in ["conservative", "standard", "strong"]:
        sims = [
            simulate_channel(
                spend_jpy=budget,
                channel=channel,
                objective=objective,
                industry=industry,
                month=month,
                scenario=name,
                brand_factor=brand_factor,
                store=store,
            )
            for channel, budget in budgets.items()
        ]
        spend = sum(budgets.values())
        conversions = sum(sim.conversions for sim in sims)
        revenue = sum(sim.revenue_jpy for sim in sims)
        summaries.append(
            ScenarioSummary(
                name=name,
                conversions=conversions,
                revenue_jpy=revenue,
                cpa_jpy=spend / conversions if conversions > 0 else float(spend),
                roas=revenue / spend if spend > 0 else 0,
                source={"scenario": name, "data_kind": "industry_seed"},
            )
        )
    return summaries


def _sensitivity_summaries(
    *,
    budgets: dict[str, int],
    objective: str,
    industry: str,
    month: int | None,
    baseline: dict[str, float],
    brand_factor: float,
    store: BenchmarkStore,
) -> list[SensitivitySummary]:
    levers = [
        ("budget", "+20%", {"budget_multiplier": 1.20}),
        ("cvr", "+20%", {"cvr_multiplier": 1.20}),
        ("aov", "+20%", {"aov_multiplier": 1.20}),
        ("cpm", "-20%", {"cpm_multiplier": 0.80}),
    ]
    summaries: list[SensitivitySummary] = []
    for lever, change, params in levers:
        totals = _simulate_with_sensitivity(
            budgets=budgets,
            objective=objective,
            industry=industry,
            month=month,
            store=store,
            brand_factor=brand_factor,
            **params,
        )
        conversions_delta = totals["conversions"] - baseline["conversions"]
        cpa_delta = totals["cpa"] - baseline["cpa"]
        summaries.append(
            SensitivitySummary(
                lever=lever,
                change=change,
                conversions_delta=conversions_delta,
                cpa_delta_jpy=cpa_delta,
                next_action=_next_action(lever, conversions_delta, cpa_delta),
            )
        )
    return summaries


def _simulate_with_sensitivity(
    *,
    budgets: dict[str, int],
    objective: str,
    industry: str,
    month: int | None,
    store: BenchmarkStore,
    brand_factor: float,
    budget_multiplier: float = 1.0,
    cvr_multiplier: float = 1.0,
    aov_multiplier: float = 1.0,
    cpm_multiplier: float = 1.0,
) -> dict[str, float]:
    items: list[AllocationItem] = []
    for channel, budget in budgets.items():
        assumption = store.assumption_for(channel=channel, objective=objective, industry=industry)
        sim = simulate_channel(
            spend_jpy=budget * budget_multiplier,
            channel=channel,
            objective=objective,
            industry=industry,
            month=month,
            metric_overrides={
                "cvr": assumption.metrics["cvr"] * cvr_multiplier,
                "aov": assumption.metrics["aov"] * aov_multiplier,
                "cpm": assumption.metrics["cpm"] * cpm_multiplier,
            },
            brand_factor=brand_factor,
            store=store,
        )
        items.append(
            AllocationItem(
                channel=channel,
                budget_jpy=round(budget * budget_multiplier),
                simulation=sim,
                marginal_score_per_jpy=0,
                bullseye_status="検証中",
                reasons=[],
                warnings=[],
                source=sim.source,
            )
        )
    return _totals(items)


def _next_action(lever: str, conversions_delta: float, cpa_delta: float) -> str:
    if lever == "budget" and conversions_delta > 0 and cpa_delta <= 0:
        return "予算増でもCPAが横ばいなので増額余地あり"
    if lever == "cvr" and conversions_delta > 0:
        return "LP/フォーム改善が成果に効くためCVR改善を優先"
    if lever == "aov" and conversions_delta >= 0:
        return "客単価改善はROAS改善に直結"
    if lever == "cpm" and cpa_delta < 0:
        return "入札単価または面の見直しで効率改善余地あり"
    return "追加データで前提を更新してから判断"


def _weighted_confidence(items: list[AllocationItem]) -> float:
    total_budget = sum(item.budget_jpy for item in items) or 1
    return sum(
        item.simulation.assumption.confidence * item.budget_jpy / total_budget
        for item in items
    )
