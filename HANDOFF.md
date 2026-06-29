# Tact Handoff

## 1. Target SSoT

Repo: `synergia-yoshi/Tact`
Local path: `C:\dev\repos\Tact`
Branch: `codex/ms4-rich-dashboard`
Base: `origin/codex/ms3-generation-experience` / PR #13
Draft PR: `https://github.com/synergia-yoshi/Tact/pull/14`

MS4 implements the rich dashboard brief from
`2026-06-30-Codex-MS4-rich-dashboard.md`. Runtime truth remains the FastAPI
backend: the UI renders dashboard API responses and never fabricates measured
values, trend lines, Kill Switch state, or audit history.

Visual SSoT remains `design-reference.html`; the implemented app continues the
blue-token direction and avoids purple gradients in charts and app chrome.

## 2. What Changed

- Added dashboard read models in `app/models/dashboard.py`:
  KPI metrics, channel rows, improvement-cycle history, and server-derived
  Kill Switch state.
- Added `MetricSeriesPoint` and `MetricSnapshot.series` so time-series points
  are explicitly supplied by the backend, including `value = null` gaps.
- Extended the mock measurement adapter to return source-labeled test series
  with an intentional gap. The UI shows gaps as `データなし` and does not
  interpolate.
- Added `GET /api/v1/campaigns/{campaign_id}/dashboard` with period and channel
  filters. KPI totals and channel rows are calculated server-side from
  `media_plan` plus the latest `MetricSnapshot`.
- Added `POST /api/v1/campaigns/{campaign_id}/kill-switch/stop-simulation`.
  It is role-gated to approver/admin, records hash-chain audit, and states that
  test media performs no real stop.
- Kept `kill-switch/evaluate` as a status check; destructive-like stop intent is
  separate and audited.
- Updated Dashboard UI:
  KPI summary band, period/channel segmented filters, source labels on every
  numeric value, Chart.js line only when series is supplied, current/empty state
  otherwise, channel rows with source-labeled metrics and gap-respecting
  sparklines, improvement-loop timeline, and Kill Switch controls.
- Added chart alternative text and a compact data table for the chart source
  data.
- Preserved partial rendering: role switching updates Kill buttons without
  recreating an unchanged chart canvas.
- Updated audit formatting for `campaign.kill_switch.stop_requested`.
- Rebuilt committed Vite assets in `app/web/dist`.

## 3. Current State

Working:

- Dashboard shows KPI summary, media/channel status, improvement-loop history,
  and Kill Switch in one screen.
- Empty/unmeasured state is honest: no metric value and no chart line is shown
  before measurement.
- All displayed numeric values carry a source label (`テスト用`, `実データ`, or
  pending state). Mock values are labeled `テスト用`.
- Time-series lines render only from supplied `MetricSnapshot.series`; missing
  points remain `データなし`.
- Period and channel filters call the dashboard API and change server-side
  aggregation.
- Channel rows include planned budget, spend, ROAS, CPA, conversions, source
  labels, and sparklines only when series is present.
- Kill Switch state is server-derived. `止める想定` is disabled for operator and
  enabled for approver/admin; successful operation appends audit.
- Audit view formats the new Kill event without exposing raw JSON.
- Mobile 390x844 E2E verifies no document-level horizontal overflow on the rich
  dashboard path.

Still simulated/mock:

- Measurement is the GA4/Shopify mock adapter.
- Media planning, publish, delivery status, and stop intent are mock/test media.
- Kill Switch stop is simulation only; no real media stop API is connected.
- Real OAuth and production role/session separation remain later work.

## 4. Validation

- `.\.venv312\Scripts\python.exe -m pytest -q` passed: 41 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `npm run test` passed:
  TypeScript typecheck and Vitest.
- `npm run test:e2e` passed: 4 Playwright tests.
  Coverage includes proposal -> gate -> approval -> rich dashboard, empty
  dashboard state, media filtering, supplied time-series/gap display, Kill role
  control, Kill audit entry, chart stability across role switching, settings,
  and mobile no-horizontal-overflow.
- `npm run build` passed as part of E2E and refreshed `app/web/dist`.
- `git diff --check` passed.

Known warning: FastAPI/Starlette TestClient emits the existing `httpx2`
deprecation warning only.

## 5. Assumptions Made

- PR split is fixed as:
  - #12: MS2 Vite vertical slice
  - #13: MS2.5-MS3.5 UI/generation experience
  - #14: MS4 rich dashboard
- MS4 stacks on PR #13 via branch `codex/ms4-rich-dashboard`.
- Mock channel-level metrics are acceptable because they are server-generated,
  deterministic, and labeled `テスト用`.
- `app/web/dist` remains committed because FastAPI serves built assets directly.
- §5 brand/appeal copy remains on hold; only plain existing-tone operational
  labels were added.

## 6. Next Work

1. Add real channel-dimension measurement when the measurement adapter supports
   it; keep the same dashboard contract.
2. Connect real delivery stop/pause APIs only after scoped backend design and
   approval workflow are approved.
3. Split customer-facing read views from operator controls by role.
4. Continue backend hardening separately: Firestore append-only transactions,
   legal dictionary hardening, real GA4/Shopify adapters, Google Ads OAuth, and
   production auth/session issuer.

## 7. Awaiting Approval / Decisions

- Real media stop scope and approval workflow.
- Whether the dashboard endpoint should become a broader reporting API once
  real integrations land.
- Long-term policy for committing `app/web/dist`.
- Production auth/session design.

## PR Acceptance Checklist

- [x] KPI summary band, media status, improvement loop, and Kill Switch are
  present and stable in empty states.
- [x] All numeric values have source labels or an explicit pending state.
- [x] No fake measured values or fake trend lines are shown without backend
  supply.
- [x] Time-series line appears only when supplied; gaps are not interpolated.
- [x] Kill Switch stop intent is approver/admin-only and audited.
- [x] Chart uses blue tokens, has alternative text/data table, and remains
  stable across role switching.
- [x] Mobile dashboard path has no document-level horizontal overflow.
- [x] pytest, ruff, npm test, E2E, build, and diff check pass.
