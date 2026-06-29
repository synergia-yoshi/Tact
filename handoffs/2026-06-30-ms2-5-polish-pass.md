# Tact Handoff Snapshot: MS2.5 Polish Pass

## 1. Target SSoT

Repo: `synergia-yoshi/Tact`
Branch: `codex/ui-ms2-vite-vertical-slice`
Base: PR #12 commit `5e901f8`, stacked on PR #11 / `c2e8cea`

This pass implements the MS2.5 polish instructions from
`2026-06-29-Codex-MS2.5-polish-pass.md`. The governing principle is that the UI
must not make the product look more real than the backend state supports.

## 2. What Changed

- Added operation-specific loading state in the UI store.
- Disabled async buttons and showed compact spinners/loading panels for:
  proposal creation, publish gate, approval, role switch, audit load, and audit
  verify.
- Guarded async handlers so repeated clicks do not submit duplicate requests.
- Reworked rendering to update only changed view signatures instead of
  rebuilding every panel on every state change.
- Kept Chart.js stable across role/toast changes and only recreated the chart
  when metric data or the canvas changes.
- Replaced the fake upward trend chart with a single current-value bar and
  explicit "時系列未接続" copy.
- Added backend `EstimateRange` values for media plan reach/CPA and
  MetricSnapshot CPA/ROAS/conversions.
- Removed UI-side +/-14% forecast ranges and hard-coded confidence text.
- Formatted audit verification as continuity status instead of raw JSON.
- Hid the role switcher when local dev-token minting is unavailable.
- Made toast errors assertive and restored focus after closing the evidence
  modal.
- Rebuilt `app/web/dist`.

## 3. Current State

Working:

- Home -> proposal -> creative/media plan -> gate -> pending approval ->
  approval -> dashboard still works end to end.
- Loading/disabled states are visible for the primary async operations.
- The dashboard no longer implies a performance trajectory without time-series
  data.
- Forecast/metric ranges and confidence are backend response fields.
- Audit verify shows "連続性OK・N件" or broken entry/reason.
- Role switch UI is shown only after `/api/v1/auth/dev-token` succeeds.

Still mock/simulated:

- GA4/Shopify measurement adapter.
- Media planning/publish/delivery status.
- Kill Switch stop behavior.
- Local dev-token issuer.

## 4. Validation

- `npm run test` passed.
- `npm run test:e2e` passed.
- `npm run build` passed as part of E2E and refreshed `app/web/dist`.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 38 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.

Known warning: existing FastAPI/Starlette TestClient `httpx2` deprecation
warning only.

## 5. Assumptions Made

- Backend-generated simulated ranges are acceptable for MS2.5 when labeled as
  server-provided simulation data.
- Time-series remains a later milestone; current-value charting is more honest
  than a fabricated line.
- Disabling audit verify for non-admin users in the UI is acceptable while the
  server-side admin policy remains the source of truth.
- `app/web/dist` remains committed for immediate FastAPI serving after checkout.

## 6. Next Work

1. Decide whether to fold this MS2.5 pass into PR #12 or split it into a small
   follow-up PR.
2. Add Dashboard improvement-loop history, media status, and Kill Switch API
   wiring.
3. Separate customer-facing read views from operator controls by role.
4. Continue backend hardening separately:
   Firestore append-only transaction, legal dictionary normalization, real
   GA4/Shopify, Google Ads OAuth, and scoped real stop/pause.

## 7. Awaiting Approval / Decisions

- Long-term policy for committing `app/web/dist`.
- Production auth/session design and token issuer.
- Whether/when to introduce React for larger UI state.
- Customer-facing copy and role-separated view boundaries.

## PR Acceptance Checklist

- [x] Async operations show visible loading/disabled states and prevent duplicate
  submission.
- [x] Changed-state rendering avoids unnecessary full-panel rebuilds.
- [x] Chart does not flicker on role/toast-only updates.
- [x] Chart no longer shows a fabricated upward trend.
- [x] Forecast ranges/confidence are backend-derived or marked as missing
  estimates.
- [x] Audit verify result is formatted, not raw JSON.
- [x] Role switch UI is local/dev-token-only.
- [x] Existing unit, E2E, Python, ruff, and whitespace checks pass.
