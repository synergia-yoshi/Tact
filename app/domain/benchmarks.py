from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from statistics import median
from typing import Any

import yaml

BENCHMARKS_PATH = Path(__file__).with_name("benchmarks.yaml")
CURRENT_YEAR = 2026


@dataclass(frozen=True)
class BenchmarkSource:
    file: str
    year: int | str | None
    type: str
    data_kind: str = "industry_seed"

    @property
    def latest_year(self) -> int | None:
        if isinstance(self.year, int):
            return self.year
        if isinstance(self.year, str):
            years = [int(part) for part in self.year.split("-") if part.isdigit()]
            return max(years) if years else None
        return None

    def as_dict(self) -> dict[str, int | str | None]:
        return {
            "file": self.file,
            "year": self.year,
            "type": self.type,
            "data_kind": self.data_kind,
        }


@dataclass(frozen=True)
class ChannelAssumption:
    industry: str
    requested_channel: str
    channel_class: str
    media: str
    device: str
    funnel_stage: str
    metrics: dict[str, float]
    metric_sources: dict[str, dict[str, object]]
    source: BenchmarkSource
    n: int
    sd: float | None
    confidence: float
    notes: list[str]
    fallback: bool = False

    def source_payload(self) -> dict[str, object]:
        engine_default_metrics = sorted(
            key
            for key, source in self.metric_sources.items()
            if source.get("data_kind") == "engine_default"
        )
        return {
            **self.source.as_dict(),
            "industry": self.industry,
            "media": self.media,
            "device": self.device,
            "funnel_stage": self.funnel_stage,
            "confidence": round(self.confidence, 4),
            "n": self.n,
            "fallback": self.fallback,
            "engine_default_metrics": engine_default_metrics,
            "metric_sources": self.metric_sources,
        }


class BenchmarkStore:
    def __init__(self, raw: dict[str, Any]) -> None:
        self.raw = raw
        self.meta = raw.get("meta", {})
        self.conventions = raw.get("conventions", {})
        self.engine_defaults = raw.get("engine_defaults", {})
        self.confidence_model = raw.get("confidence_model", {})
        self.pipeline_model = raw.get("pipeline_model", {})
        self.seasonality = raw.get("seasonality", {})
        self.defunct_media = set(self.meta.get("defunct_media", []))
        self._rows = self._flatten_rows()

    def assumption_for(
        self,
        *,
        channel: str,
        objective: str,
        industry: str | None = None,
    ) -> ChannelAssumption:
        selected_industry = industry or infer_industry(objective=objective)
        channel_class = self.channel_class_for(channel)
        candidates = set(self.media_candidates(channel_class))
        exact = [
            row
            for row in self._rows
            if row["industry"] == selected_industry and row["media"] in candidates
        ]
        fallback = False
        rows = exact
        notes: list[str] = []
        if not rows:
            rows = [row for row in self._rows if row["media"] in candidates]
            fallback = True
            notes.append("industry fallback: 汎用ベンチで推定")
        if not rows:
            rows = self._rows
            fallback = True
            notes.append("media fallback: 全媒体ベンチの中央値で推定")

        metrics, metric_sources = self._median_metrics(rows, channel_class=channel_class)
        source = self._combined_source(rows)
        confidence = self._median([float(row.get("confidence", 0.35)) for row in rows]) or 0.35
        if fallback:
            confidence *= 0.75
        n = max(1, sum(int(row.get("n", 1) or 1) for row in rows))
        return ChannelAssumption(
            industry=selected_industry,
            requested_channel=channel,
            channel_class=channel_class,
            media=self._representative_media(rows, candidates, channel_class),
            device=self._representative_value(rows, "device", "all"),
            funnel_stage=self._representative_value(rows, "funnel_stage", channel_class),
            metrics=metrics,
            metric_sources=metric_sources,
            source=source,
            n=n,
            sd=self._median([float(row["sd"]) for row in rows if row.get("sd") is not None]),
            confidence=max(0.05, min(0.95, confidence)),
            notes=notes,
            fallback=fallback,
        )

    def channel_class_for(self, channel: str) -> str:
        normalized = channel.strip().lower()
        classes = self.engine_defaults.get("channel_classes", {})
        if normalized in classes:
            return normalized
        for class_name, config in classes.items():
            if normalized in set(config.get("media", [])):
                return str(class_name)
        if "search" in normalized:
            return "search"
        if normalized in {"social", "sns", "facebook", "twitter", "x"}:
            return "social"
        if normalized in {"display", "banner", "dsp", "gdn", "ydn"}:
            return "display"
        if "retarget" in normalized or "remarket" in normalized:
            return "retargeting"
        return "display"

    def media_candidates(self, channel_class: str) -> list[str]:
        config = self.engine_defaults.get("channel_classes", {}).get(channel_class, {})
        candidates = [str(media) for media in config.get("media", [])]
        return [media for media in candidates if media not in self.defunct_media]

    def class_default(self, channel_class: str, key: str, default: float) -> float:
        value = (
            self.engine_defaults.get("channel_classes", {})
            .get(channel_class, {})
            .get(key, default)
        )
        return float(value)

    def engine_default_source(self, *, keys: list[str] | None = None) -> dict[str, object]:
        source = self.engine_defaults.get("source", {})
        payload = _source_from_dict(
            source,
            data_kind=str(source.get("data_kind", "engine_default")),
        ).as_dict()
        payload["confidence"] = float(self.engine_defaults.get("confidence", 0.25))
        payload["note"] = str(self.engine_defaults.get("note", "owner-unconfirmed seed"))
        if keys is not None:
            payload["keys"] = keys
        return payload

    def objective_profile(self, objective: str) -> dict[str, float]:
        profiles = self.engine_defaults.get("objective_profiles", {})
        return {
            str(key): float(value)
            for key, value in profiles.get(objective, profiles.get("conversion", {})).items()
        }

    def attribution_weight(self, channel_class: str, model: str) -> float:
        models = self.engine_defaults.get("attribution_models", {})
        weights = models.get(model, models.get("position_based", {}))
        return float(weights.get(channel_class, 1.0))

    def scenario_multipliers(self, scenario: str) -> dict[str, float]:
        scenarios = self.engine_defaults.get("scenario_multipliers", {})
        return {
            str(key): float(value)
            for key, value in scenarios.get(scenario, scenarios.get("standard", {})).items()
        }

    def seasonality_factor(
        self,
        industry: str,
        month: int | None,
    ) -> tuple[float, dict[str, object] | None]:
        if month is None:
            return 1.0, None
        cvr_factor = self._monthly_cvr_seasonality_factor(industry, month)
        if cvr_factor is not None:
            return cvr_factor
        key = "ec_generic_organic" if industry == "ec_generic" else industry
        config = self.seasonality.get(key)
        if not config:
            return 1.0, None
        ratios = config.get("budget_allocation_ratio")
        if not ratios:
            source = dict(config.get("source", {}))
            source["basis"] = "qualitative_seasonality_note"
            source["factor"] = 1.0
            return 1.0, source
        month_ratio = float(ratios.get(str(month), 1 / 12))
        average_ratio = sum(float(value) for value in ratios.values()) / len(ratios)
        source = dict(config.get("source", {}))
        source["basis"] = "budget_allocation_ratio_relative_to_monthly_average"
        source["factor"] = month_ratio / average_ratio
        return month_ratio / average_ratio, source

    def objective_score_unit_values(self) -> dict[str, float]:
        values = self.engine_defaults.get("objective_score_unit_values", {})
        return {
            "sessions_value_ratio": float(values.get("sessions_value_ratio", 0.02)),
            "reach_value_ratio": float(values.get("reach_value_ratio", 0.001)),
        }

    def measurement_delivery_ratio(self) -> float:
        snapshot = self.engine_defaults.get("measurement_snapshot", {})
        return float(snapshot.get("delivery_ratio", 1.0))

    def measurement_series_points(self) -> int:
        return int(self.engine_defaults.get("measurement_snapshot", {}).get("series_points", 8))

    def measurement_missing_index(self) -> int:
        snapshot = self.engine_defaults.get("measurement_snapshot", {})
        return int(snapshot.get("missing_point_index", 3))

    def feasibility_thresholds(self) -> dict[str, float]:
        return {
            str(key): float(value)
            for key, value in self.engine_defaults.get("feasibility", {}).items()
        }

    def confidence_base(self, source_type: str) -> float:
        by_type = self.confidence_model.get("by_type", {})
        return float(by_type.get(source_type, 0.4))

    def staleness_halflife_years(self) -> float:
        return float(self.confidence_model.get("staleness_halflife_years", 5))

    def _flatten_rows(self) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        metrics = set(self.conventions.get("metrics", []))
        for group in self.raw.get("benchmarks", []):
            group_source = _source_from_dict(
                group.get("source", {}),
                data_kind=self.meta.get("data_kind_default", "industry_seed"),
            )
            industry = str(group.get("industry", "generic"))
            monthly_cvr_avg = group.get("monthly_cvr_avg")
            if isinstance(monthly_cvr_avg, dict):
                rows.append(
                    {
                        "industry": industry,
                        "media": str(group.get("channel", "organic")),
                        "device": "all",
                        "funnel_stage": "organic",
                        "metrics": {},
                        "source": group_source,
                        "n": 1,
                        "sd": None,
                        "confidence": 0.45,
                        "note": group.get("notes"),
                        "monthly_cvr_avg": {
                            str(key): float(value)
                            for key, value in monthly_cvr_avg.items()
                            if isinstance(value, int | float)
                        },
                    }
                )
            for row in group.get("rows", []):
                media = str(row.get("media", ""))
                if media in self.defunct_media:
                    continue
                metric_values = {
                    key: float(row[key])
                    for key in metrics
                    if key in row and isinstance(row[key], int | float)
                }
                if "view_through_rate" in row:
                    metric_values["view_through_rate"] = float(row["view_through_rate"])
                source = _source_from_dict(
                    row.get("source", group_source.as_dict()),
                    data_kind=group_source.data_kind,
                )
                rows.append(
                    {
                        "industry": industry,
                        "media": media,
                        "device": str(row.get("device", "all")),
                        "funnel_stage": str(row.get("funnel_stage", "unknown")),
                        "metrics": metric_values,
                        "source": source,
                        "n": int(row.get("n", 1) or 1),
                        "sd": row.get("sd"),
                        "confidence": float(row.get("confidence", 0.35)),
                        "note": row.get("note") or group.get("notes"),
                    }
                )
        return rows

    def _median_metrics(
        self,
        rows: list[dict[str, object]],
        *,
        channel_class: str,
    ) -> tuple[dict[str, float], dict[str, dict[str, object]]]:
        metric_names = {
            "cpm",
            "ctr",
            "cpc",
            "cvr",
            "cpa",
            "cpi",
            "install_rate",
            "aov",
            "view_through_rate",
        }
        metrics: dict[str, float] = {}
        metric_sources: dict[str, dict[str, object]] = {}
        for name in metric_names:
            values = []
            source_rows = []
            for row in rows:
                row_metrics = row.get("metrics", {})
                if (
                    isinstance(row_metrics, dict)
                    and name in row_metrics
                    and isinstance(row_metrics[name], int | float)
                    and float(row_metrics[name]) > 0
                ):
                    values.append(float(row_metrics[name]))
                    source_rows.append(row)
            if values:
                metrics[name] = median(values)
                metric_sources[name] = self._metric_benchmark_source(source_rows)

        ctr = self._metric_or_default(
            metrics,
            metric_sources,
            channel_class=channel_class,
            key="ctr",
            default=0.005,
        )
        cvr = metrics.get("cvr") or metrics.get("install_rate")
        if "cvr" not in metric_sources and "install_rate" in metric_sources:
            metric_sources["cvr"] = {
                **metric_sources["install_rate"],
                "mapped_from": "install_rate",
            }
        if cvr is None:
            cvr = self._metric_or_default(
                metrics,
                metric_sources,
                channel_class=channel_class,
                key="cvr",
                default=0.005,
            )
        cpc = metrics.get("cpc")
        cpm = metrics.get("cpm")
        if cpm is None and cpc is not None and ctr > 0:
            cpm = cpc * ctr * 1000
            metric_sources["cpm"] = {
                "data_kind": "derived",
                "formula": "cpc * ctr * 1000",
                "inputs": ["cpc", "ctr"],
            }
        if cpm is None:
            cpm = self._metric_or_default(
                metrics,
                metric_sources,
                channel_class=channel_class,
                key="cpm",
                default=800,
            )
        if cpc is None and cpm is not None and ctr > 0:
            cpc = cpm / (ctr * 1000)
            metric_sources["cpc"] = {
                "data_kind": "derived",
                "formula": "cpm / (ctr * 1000)",
                "inputs": ["cpm", "ctr"],
            }

        metrics["ctr"] = ctr
        metrics["cvr"] = cvr
        metrics["cpm"] = cpm
        metrics["cpc"] = cpc or cpm / max(metrics["ctr"], 1e-9) / 1000
        metrics["aov"] = self._metric_or_default(
            metrics,
            metric_sources,
            channel_class=channel_class,
            key="aov",
            default=10000,
        )
        operational_defaults = {
            "frequency": 3,
            "audience_size": 100000,
            "response_k_ratio": 1,
            "search_demand_conversions": math.inf,
            "search_is_cap": 1,
            "min_test_share": 0,
        }
        for key, default in operational_defaults.items():
            metrics[key] = self.class_default(channel_class, key, default)
            metric_sources[key] = self.engine_default_source(keys=[channel_class, key])
        return metrics, metric_sources

    def _metric_or_default(
        self,
        metrics: dict[str, float],
        metric_sources: dict[str, dict[str, object]],
        *,
        channel_class: str,
        key: str,
        default: float,
    ) -> float:
        if key in metrics:
            return metrics[key]
        value = self.class_default(channel_class, key, default)
        metrics[key] = value
        metric_sources[key] = self.engine_default_source(keys=[channel_class, key])
        return value

    def _metric_benchmark_source(self, rows: list[dict[str, object]]) -> dict[str, object]:
        source = self._combined_source(rows)
        return {
            **source.as_dict(),
            "data_kind": source.data_kind,
            "n": max(1, sum(int(row.get("n", 1) or 1) for row in rows)),
        }

    def _monthly_cvr_seasonality_factor(
        self,
        industry: str,
        month: int,
    ) -> tuple[float, dict[str, object]] | None:
        for row in self._rows:
            if row.get("industry") != industry:
                continue
            monthly = row.get("monthly_cvr_avg")
            if not isinstance(monthly, dict) or str(month) not in monthly:
                continue
            values = [float(value) for value in monthly.values() if float(value) > 0]
            if not values:
                continue
            source = row.get("source")
            source_payload = source.as_dict() if isinstance(source, BenchmarkSource) else {}
            factor = float(monthly[str(month)]) / (sum(values) / len(values))
            return factor, {
                **source_payload,
                "basis": "monthly_cvr_avg_relative_to_annual_average",
                "factor": factor,
            }
        return None

    def _combined_source(self, rows: list[dict[str, object]]) -> BenchmarkSource:
        sources = [row["source"] for row in rows if isinstance(row.get("source"), BenchmarkSource)]
        if not sources:
            source = self.engine_defaults.get("source", {})
            return _source_from_dict(
                source,
                data_kind=self.meta.get("data_kind_default", "industry_seed"),
            )
        files = sorted({source.file for source in sources})
        source_type = "actual" if any(source.type == "actual" for source in sources) else "sim"
        years = [source.latest_year for source in sources if source.latest_year is not None]
        return BenchmarkSource(
            file=" / ".join(files[:3]),
            year=max(years) if years else None,
            type=source_type,
            data_kind=sources[0].data_kind,
        )

    def _representative_media(
        self,
        rows: list[dict[str, object]],
        candidates: set[str],
        channel_class: str,
    ) -> str:
        for row in rows:
            media = str(row.get("media", ""))
            if media in candidates:
                return media
        return next(iter(candidates), channel_class)

    def _representative_value(
        self,
        rows: list[dict[str, object]],
        key: str,
        default: str,
    ) -> str:
        return str(rows[0].get(key, default)) if rows else default

    def _median(self, values: Iterable[float]) -> float | None:
        scoped = [value for value in values if math.isfinite(value)]
        return median(scoped) if scoped else None


@lru_cache(maxsize=1)
def load_benchmarks(path: str | Path = BENCHMARKS_PATH) -> BenchmarkStore:
    with Path(path).open("r", encoding="utf-8") as stream:
        raw = yaml.safe_load(stream)
    if not isinstance(raw, dict):
        raise ValueError("benchmarks.yaml must contain a mapping")
    return BenchmarkStore(raw)


def infer_industry(
    *,
    objective: str,
    target_audience: str = "",
    campaign_name: str = "",
) -> str:
    text = f"{objective} {target_audience} {campaign_name}".lower()
    if any(token in text for token in ["b2b", "saas", "lead", "リード", "商談"]):
        return "btob_saas"
    if any(token in text for token in ["app", "install", "アプリ"]):
        return "app_install_automotive"
    if any(token in text for token in ["school", "education", "学生", "学校"]):
        return "education_school"
    if any(token in text for token in ["bridal", "wedding", "結婚"]):
        return "bridal"
    if any(token in text for token in ["real estate", "不動産", "賃貸"]):
        return "real_estate_rental"
    if any(token in text for token in ["recruit", "採用"]):
        return "recruiting"
    return "ec_generic"


def _source_from_dict(data: dict[str, Any], *, data_kind: str) -> BenchmarkSource:
    return BenchmarkSource(
        file=str(data.get("file", "Tact engine seed defaults")),
        year=data.get("year"),
        type=str(data.get("type", "sim")),
        data_kind=str(data.get("data_kind", data_kind)),
    )
