from __future__ import annotations

from dataclasses import dataclass

from app.domain.benchmarks import BenchmarkStore, load_benchmarks


@dataclass(frozen=True)
class PipelineResult:
    sessions: float
    form_visits: float
    leads: float
    deals: float
    wins: float
    form_cvr: float
    win_cvr: float
    source: dict[str, object]
    formula: str


def calculate_pipeline(
    *,
    sessions: float,
    store: BenchmarkStore | None = None,
    transition_rate: float | None = None,
    completion_rate: float | None = None,
    lead_to_deal: float | None = None,
    deal_to_win: float | None = None,
) -> PipelineResult:
    store = store or load_benchmarks()
    site = _btob_site_model(store)
    model = store.pipeline_model
    transition = transition_rate if transition_rate is not None else site["transition_rate"]
    completion = completion_rate if completion_rate is not None else site["completion_rate"]
    lead_deal = lead_to_deal if lead_to_deal is not None else _midpoint(
        model.get("rates", {}).get("lead_to_deal", {})
    )
    deal_win = deal_to_win if deal_to_win is not None else float(
        model.get("rates", {}).get("deal_to_win", {}).get("point", 0.20)
    )
    form_visits = sessions * transition
    leads = form_visits * completion
    deals = leads * lead_deal
    wins = deals * deal_win
    return PipelineResult(
        sessions=sessions,
        form_visits=form_visits,
        leads=leads,
        deals=deals,
        wins=wins,
        form_cvr=transition * completion,
        win_cvr=transition * completion * lead_deal * deal_win,
        source={
            "file": "ネットプロテクションズ 才流 第1/2回報告",
            "year": 2022,
            "type": "actual",
            "data_kind": "industry_seed",
        },
        formula="sessions * transition_rate * completion_rate * lead_to_deal * deal_to_win",
    )


def _btob_site_model(store: BenchmarkStore) -> dict[str, float]:
    for group in store.raw.get("benchmarks", []):
        if group.get("industry") == "btob_saas" and isinstance(group.get("form_funnel"), dict):
            form = group["form_funnel"]
            return {
                "transition_rate": float(form.get("transition_rate", 0.0272)),
                "completion_rate": float(
                    form.get("completion_rate_target")
                    or form.get("completion_rate_after_efo")
                    or form.get("completion_rate", 0.1299)
                ),
            }
    return {"transition_rate": 0.0272, "completion_rate": 0.20}


def _midpoint(config: object) -> float:
    if isinstance(config, dict):
        low = float(config.get("low", config.get("point", 0.25)))
        high = float(config.get("high", config.get("point", low)))
        return (low + high) / 2
    if isinstance(config, int | float):
        return float(config)
    return 0.25
