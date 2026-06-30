# Tact Handoff

## 1. Target SSoT

Repo: `synergia-yoshi/Tact`
Local path: `C:\dev\repos\Tact`
Branch: `codex/engine-simulation-allocation`
Base: stacked on `codex/ms6-production-hardening`
Source spec:
`C:\dev\Obsidian\10_Projects\Tact\2026-06-30-Codex-engine-simulation-allocation-spec.md`
Scope handoff:
`C:\dev\Obsidian\10_Projects\Tact\2026-06-30-Codex-engine-handoff-implementable.md`

This branch implements the pure domain engine for simulation estimates and
media allocation. It replaces the old placeholder media and measurement mock
constants with deterministic calculations sourced from `app/domain/benchmarks.yaml`.

## 2. What Changed

- Added `app/domain/benchmarks.yaml` from the Obsidian seed and isolated
  engine-only seed defaults for frequency, audience size, objective weights,
  attribution weights, scenario multipliers, and learning thresholds.
- Added pure domain modules:
  - `app/domain/benchmarks.py`
  - `app/domain/simulation.py`
  - `app/domain/pipeline.py`
  - `app/domain/allocation.py`
  - `app/domain/uncertainty.py`
- Implemented funnel simulation:
  `imp = spend / CPM * 1000`, reach with frequency saturation, clicks, sessions,
  conversions, revenue, CPA, and ROAS.
- Implemented three saturation guards:
  concave response, finite-audience frequency saturation, and search
  impression-share hard cap.
- Implemented BtoB pipeline calculation:
  `session -> form -> lead -> deal -> win`, with `CVR = transition * completion`
  and downstream sales yields.
- Implemented allocation by greedy marginal score equalization with objective
  weights, attribution model weights, seasonality, Bullseye status, reasons,
  and feasibility warnings.
- Implemented uncertainty ranges as 95% prediction intervals using source type,
  age, confidence seed, `sd`, and `n`. The old fixed confidence value is gone.
- Replaced `MockMediaAdapter.create_plan` placeholder budget/reach/CPA logic with
  the domain allocation engine.
- Replaced `MockMeasurementAdapter.fetch_snapshot` hash-derived mock metrics with
  domain allocation/simulation outputs.
- Added `media_plan_model` as a dashboard metric source and updated UI labels to
  show model estimates as "auto estimate" instead of mock test data.
- Added domain tests for funnel arithmetic, saturation, allocation, pipeline,
  uncertainty convergence, scenarios, sensitivity, feasibility, and defunct media.

## 3. Current State

Working:

- Existing campaign proposal, dashboard, publish-gate, role, audit, legal, and
  kill-switch flows are preserved.
- Media plan estimates now return `source="model"` and estimate ranges with
  `source="model"`.
- Dashboard planned metrics use `media_plan_model`.
- Defunct media from the seed (`mediaforge`, `vizury`, `gunosy`) are filtered out
  of active allocation candidates.
- Every domain result carries benchmark source payloads and formulas.
- Demo build output was regenerated with `VITE_DEMO_MODE=1`.

Still owner/manual:

- Benchmark values remain owner-unconfirmed seeds, not definitive market facts.
- Real OAuth/API data connections are still out of scope for this branch.
- Bayesian updating from company actuals is not implemented yet.
- UI/IA for exposing the full reasoning payload is still minimal.

## 4. Validation

- `.\.venv312\Scripts\python.exe -m pytest -q` passed: 66 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `npm run test` passed: TypeScript typecheck and Vitest.
- `npm run test:e2e` passed: 5 Playwright tests.
- `VITE_DEMO_MODE=1 npm run build:demo` passed.
- `git diff --check` passed.
- `rg "0\.62" app tests -n` returned no matches.

Known warning: FastAPI/Starlette TestClient emits the existing `httpx2`
deprecation warning only. `git diff --check` also prints Windows CRLF conversion
warnings, but no whitespace errors.

## 5. PR Checklist Draft

- [x] `app/domain/{simulation,allocation,uncertainty,pipeline}.py` exists.
- [x] `app/domain/benchmarks.yaml` exists and includes seed source metadata.
- [x] Old media plan placeholder reach/CPA/budget logic is replaced.
- [x] Old measurement hash/fixed-confidence mock logic is replaced.
- [x] Saturation mechanisms are covered by tests.
- [x] Allocation sums to total budget and changes with objective.
- [x] Prediction intervals narrow as `n` increases.
- [x] Pipeline yield math is covered by tests.
- [x] Feasibility warnings are covered by tests.
- [x] Defunct media are not active allocation candidates.
- [x] Scenario, sensitivity, and next-action outputs are covered by tests.

## 6. Next Work

1. Have the owner review the benchmark seed values and wording before treating
   them as business-facing assumptions.
2. Add a richer API shape for exposing allocation reasons, scenario summaries,
   sensitivity, and feasibility warnings to the UI.
3. Connect GA4, Shopify, and media platform actuals, then update the interval
   model with real observed data.
4. Add Bayesian update / actual-overrides logic once real measurements are
   available.
