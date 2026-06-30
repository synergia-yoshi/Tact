import pytest

from app.domain.allocation import allocate_media_budget
from app.domain.benchmarks import BenchmarkSource, load_benchmarks
from app.domain.pipeline import calculate_pipeline
from app.domain.simulation import simulate_channel
from app.domain.uncertainty import prediction_interval


def test_funnel_simulation_matches_known_arithmetic_when_unsaturated() -> None:
    result = simulate_channel(
        spend_jpy=10_000,
        channel="display",
        objective="conversion",
        industry="real_estate_sale",
        metric_overrides={
            "cpm": 1000,
            "ctr": 0.10,
            "cvr": 0.10,
            "aov": 100,
            "frequency": 1,
            "audience_size": 1_000_000_000_000,
            "response_k_ratio": 0.000001,
        },
    )

    assert result.impressions == pytest.approx(10_000, rel=0.001)
    assert result.clicks == pytest.approx(1_000, rel=0.001)
    assert result.conversions == pytest.approx(100, rel=0.01)
    assert result.revenue_jpy == pytest.approx(10_000, rel=0.01)
    assert result.cpa_jpy == pytest.approx(100, rel=0.01)
    assert result.roas == pytest.approx(1, rel=0.01)
    assert result.source["benchmark"]


def test_saturation_mechanisms_cap_growth_search_and_reach() -> None:
    one = simulate_channel(
        spend_jpy=1_000_000,
        channel="display",
        objective="conversion",
        industry="real_estate_sale",
    )
    two = simulate_channel(
        spend_jpy=2_000_000,
        channel="display",
        objective="conversion",
        industry="real_estate_sale",
    )
    search = simulate_channel(
        spend_jpy=50_000_000,
        channel="search",
        objective="conversion",
        industry="real_estate_sale",
    )

    assert two.conversions < one.conversions * 2
    assert search.saturation.search_cap is not None
    assert search.conversions <= search.saturation.search_cap
    assert two.reach <= two.saturation.frequency_reach_cap


def test_pipeline_uses_transition_completion_and_sales_yields() -> None:
    result = calculate_pipeline(
        sessions=1000,
        transition_rate=0.10,
        completion_rate=0.50,
        lead_to_deal=0.25,
        deal_to_win=0.20,
    )

    assert result.form_visits == pytest.approx(100)
    assert result.leads == pytest.approx(50)
    assert result.deals == pytest.approx(12.5)
    assert result.wins == pytest.approx(2.5)
    assert result.form_cvr == pytest.approx(0.05)
    assert result.win_cvr == pytest.approx(0.0025)
    assert result.source["type"] == "actual"


def test_allocation_balances_budget_goal_seasonality_and_sources() -> None:
    conversion = allocate_media_budget(
        total_budget_jpy=1_000_000,
        channels=["search", "social", "display"],
        objective="conversion",
        target_audience="EC buyers",
        month=7,
    )
    awareness = allocate_media_budget(
        total_budget_jpy=1_000_000,
        channels=["search", "social", "display"],
        objective="awareness",
        target_audience="EC buyers",
        month=7,
    )

    assert sum(item.budget_jpy for item in conversion.items) == 1_000_000
    assert conversion.validations == []
    assert conversion.reach_range.low <= conversion.estimated_reach <= conversion.reach_range.high
    assert conversion.cpa_range.low <= conversion.estimated_cpa_jpy <= conversion.cpa_range.high
    assert {item.channel: item.budget_jpy for item in conversion.items} != {
        item.channel: item.budget_jpy for item in awareness.items
    }
    assert all(item.source["benchmark"] for item in conversion.items)


def test_uncertainty_interval_narrows_with_sample_size_and_staleness() -> None:
    store = load_benchmarks()
    source = BenchmarkSource(
        file="test actual",
        year=2026,
        type="actual",
        data_kind="industry_seed",
    )
    small = prediction_interval(100, store=store, source=source, n=1, confidence_seed=0.7)
    large = prediction_interval(100, store=store, source=source, n=100, confidence_seed=0.7)

    assert small.low <= small.point <= small.high
    assert large.high - large.low < small.high - small.low


def test_scenarios_sensitivity_feasibility_and_defunct_media_guards() -> None:
    result = allocate_media_budget(
        total_budget_jpy=80_000,
        channels=["mediaforge", "social"],
        objective="lead_generation",
        target_audience="B2B SaaS operators",
        month=12,
    )
    scenarios = {scenario.name: scenario for scenario in result.scenarios}

    assert [item.channel for item in result.items] == ["social"]
    assert scenarios["conservative"].conversions < scenarios["standard"].conversions
    assert scenarios["standard"].conversions < scenarios["strong"].conversions
    assert result.sensitivity
    assert any("learning volume below FB" in warning for warning in result.items[0].warnings)
