# Tact Handoff Snapshot: MS4 Rich Dashboard

## 1. Target SSoT

Repo: `synergia-yoshi/Tact`
Local path: `C:\dev\repos\Tact`
Branch: `codex/ms4-rich-dashboard`
Base branch: `origin/codex/ms3-generation-experience` (PR #13)
Draft PR: `https://github.com/synergia-yoshi/Tact/pull/14`

MS4 turns `成果` into a first-class dashboard while preserving the core rule:
the UI must not look more real than the backend state supports.

## 2. What Changed

- Added `app/models/dashboard.py` with server-shaped dashboard response models.
- Added `MetricSeriesPoint` and `MetricSnapshot.series`.
- Mock measurement now returns source-labeled test series with one explicit
  missing point.
- Added `GET /api/v1/campaigns/{campaign_id}/dashboard?period=&channel=`.
- Added server-side channel aggregation from `media_plan` placements and latest
  `MetricSnapshot`; channel values are deterministic and labeled `テスト用`.
- Added `POST /api/v1/campaigns/{campaign_id}/kill-switch/stop-simulation`.
- Changed `kill_switch.stop` policy to approver/admin.
- Dashboard UI now includes:
  - KPI summary band for spend, ROAS, CPA, conversions.
  - 7d/28d/all and all/search/social/display filters.
  - Chart.js line only for supplied series, otherwise honest empty/current state.
  - Source-labeled channel rows and gap-respecting sparklines.
  - Improvement-loop timeline with `次の改善案: まだありません`.
  - Kill Switch state and audited stop-intent action.
  - Chart alternative text and source data table.
- Audit UI formats `campaign.kill_switch.stop_requested`.
- E2E coverage now includes dashboard empty state, media filters, time-series
  gaps, Kill permission, Kill audit, chart stability, and mobile overflow.
- Rebuilt `app/web/dist`.

## 3. Current State

Working:

- Campaign creation/gate/approval flow remains intact.
- Dashboard API is the truth source for aggregation and filters.
- Pre-measurement dashboard does not show fake values or fake lines.
- Supplied time-series renders as a blue Chart.js line; missing points are
  visible as `データなし` in the data table and are not connected.
- Channel rows render only supplied/derived backend values with source labels.
- `止める想定` is disabled for operator and allowed for approver/admin.
- Stop intent creates a hash-chain audit entry.
- Mobile rich dashboard path passes no-horizontal-overflow E2E.

Still simulated:

- Mock measurement and mock media remain the only adapters.
- Channel metrics are server-side mock aggregation, not real media dimensions.
- Kill stop is simulation only.

## 4. Validation

- `.\.venv312\Scripts\python.exe -m pytest -q` -> 41 passed.
- `.\.venv312\Scripts\python.exe -m ruff check .` -> passed.
- `npm run test` -> passed.
- `npm run test:e2e` -> 4 passed.
- `npm run build` -> passed as part of E2E.
- `git diff --check` -> passed.

## 5. Assumptions Made

- PR #14 will be the draft PR for MS4, stacked on PR #13.
- Source labels map mock data to `テスト用`; real adapter labels can map to
  `実データ` without changing UI structure.
- Dashboard filters are stored in localStorage only as UI preference; all
  aggregate values come from the server.
- §5 new brand/appeal copy remains explicitly out of scope.

## 6. Next Work

1. Replace mock channel aggregation with real channel-dimension metrics when the
   measurement adapter supports them.
2. Design real media stop/pause scope before connecting any real stop API.

## 7. Awaiting Approval / Decisions

- Real Kill Switch stop scope and approval flow.
- Whether Dashboard should expose reporting exports or remain UI-only.
- Long-term committed-build-assets policy.

## PR #14 Checklist

- [x] KPI summary, media rows, improvement loop, and Kill Switch are present.
- [x] Empty state is honest and stable.
- [x] Every numeric value has source or pending state.
- [x] No fake values or fake trend lines are shown.
- [x] Time-series line appears only with backend-supplied series.
- [x] Missing series points are not interpolated.
- [x] Kill stop intent is role-gated and audited.
- [x] Chart is blue-token based and has alternative text/data table.
- [x] Mobile dashboard path has no horizontal overflow.
- [x] pytest, ruff, npm test, E2E, build, and diff check pass.
