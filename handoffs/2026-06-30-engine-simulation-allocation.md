# Engine Simulation Allocation Handoff

Date: 2026-06-30
Repo: `synergia-yoshi/Tact`
Branch: `codex/engine-simulation-allocation`
Base: stacked on `codex/ms6-production-hardening`

## Implemented

- Added `app/domain/benchmarks.yaml` from the Obsidian seed and kept all
  assumptions in YAML rather than code.
- Added:
  - `app/domain/benchmarks.py`
  - `app/domain/simulation.py`
  - `app/domain/pipeline.py`
  - `app/domain/allocation.py`
  - `app/domain/uncertainty.py`
- Replaced media planning placeholders in `app/adapters/media.py` with domain
  allocation output.
- Replaced measurement hash/fixed-confidence placeholders in
  `app/adapters/measurement.py` with domain simulation output.
- Added `media_plan_model` to measurement/dashboard source types.
- Updated UI labels and e2e expectations for model estimates.
- Added `tests/test_domain_engine.py` and updated existing API/dashboard tests.

## Acceptance Notes

- Funnel calculation follows `imp -> reach -> clicks -> sessions -> CV -> revenue
  -> CPA/ROAS`.
- Saturation includes concave response, frequency reach cap, and search
  impression-share hard cap.
- Allocation uses marginal score equalization with objective weights,
  attribution weights, seasonality, Bullseye status, and feasibility warnings.
- Pipeline calculates `session -> form -> lead -> deal -> win` yields.
- Uncertainty produces 95% prediction intervals that narrow with larger `n`.
- Defunct media (`mediaforge`, `vizury`, `gunosy`) are not allocation candidates.
- All domain outputs include source payloads and formula/reason metadata.

## Validation

- `.\.venv312\Scripts\python.exe -m pytest -q`
  - 66 passed, 1 existing TestClient warning.
- `.\.venv312\Scripts\python.exe -m ruff check .`
  - passed.
- `npm run test`
  - TypeScript typecheck and Vitest passed.
- `npm run test:e2e`
  - 5 Playwright tests passed.
- `VITE_DEMO_MODE=1 npm run build:demo`
  - passed.
- `git diff --check`
  - passed.
- `rg "0\.62" app tests -n`
  - no matches.

## Remaining Work

1. Owner review of all benchmark seed values before business-facing use.
2. API/UI expansion for detailed reasons, scenario summaries, sensitivity, and
   feasibility warnings.
3. Real GA4/Shopify/media actuals, then actual-over-seed update logic.
4. Bayesian update layer after actual data exists.

## Obsidian Log

Also recorded at:
`C:\dev\Obsidian\10_Projects\Tact\prototypes-notes\2026-06-30-codex-engine-simulation-allocation-log.md`
