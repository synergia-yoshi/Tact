# Tact Handoff

## 1. Target SSoT

Current implementation target is `synergia-yoshi/cursor`, branch
`codex/ui-ms2-vite-vertical-slice`, stacked on PR #11 base commit `c2e8cea`.

Visual SSoT is `design-reference.html` at the repository root. It is treated as
read-only reference material; implementation drift should be reviewed against
that file, not corrected by changing the reference.

Runtime SSoT remains the FastAPI backend. The UI never writes authoritative
campaign state directly; it calls reviewed API endpoints and renders server
responses.

## 2. What Changed

- Migrated the UI shell from vanilla static JS to Vite + TypeScript.
- Moved authored UI code into `app/web/src` and committed built FastAPI assets
  in `app/web/dist`.
- Added a small state store, typed API client, and client-side route switcher.
- Preserved the PR #11 design tokens and component styling while adding the
  required seven-nav structure:
  Home / Campaigns / Dashboard / Tasks / Creative / Audit / Settings.
- Restored Dashboard as a first-class campaign view with Chart.js metrics.
- Added `CampaignBrief.autonomy_level` for the three-question home form.
- Added local-only `POST /api/v1/auth/dev-token` for signed-bearer UI review
  with operator/approver/admin roles and one-hour `exp`.
- Wired the first MS2 vertical slice:
  Home form -> proposal API -> generated creative/media plan -> measurement
  refresh -> legal check -> pending publish action -> role-gated approval ->
  dashboard.
- Escaped server-derived strings before template insertion and added an XSS unit
  test.
- Added Playwright E2E for publish approval role separation and admin-only audit
  verification.

UI stack choice: Vite + TypeScript, with a lightweight store/API/router layer
instead of React for this milestone. This gives typed API boundaries, testable
state, and an upgrade path without rewriting the design-system CSS.

## 3. Current State

- Working:
  - `/` serves `app/web/dist/index.html`.
  - `/static/main.js` and `/static/index.css` serve built Vite assets.
  - Role switcher mints local signed bearer tokens under non-production envs.
  - Operator can create proposals, run measurement/legal gates, and request
    pending publish approval.
  - Operator cannot approve publish; approver/admin can.
  - Dashboard shows generated/simulated metrics with data-kind labels.
  - Audit view reads campaign audit entries; verify remains admin-only.
  - 401/403/404/409 are translated into Japanese UI messages.
- Still mock/simulated:
  - GA4/Shopify read model is the existing mock adapter.
  - Google/media publish is mock media; Kill Switch text states simulation/no
    real stop.
  - Role token minting is local-only and not a production issuer.
- Not yet complete:
  - Customer/operator screen separation is still mostly copy and role controls,
    not a separate app surface.
  - Full empty/loading/error polish exists at the main state level, but all
    subviews should be refined as lists get richer.
  - Real GA4/Shopify, Google Ads OAuth, Firestore transaction immutability, and
    legal dictionary hardening remain separate backend work.

## 4. Validation

- `npm run build` passed.
- `npm run test` passed:
  - TypeScript typecheck
  - Vitest XSS escaping unit test
- `npm run test:e2e` passed:
  - proposal -> gate -> pending approval -> operator denied -> approver
    approval -> dashboard
  - audit verify denied for operator and allowed for admin
- `.\.venv312\Scripts\python.exe -m pytest` passed: 38 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.
- Warning observed: FastAPI/Starlette TestClient emits the existing `httpx2`
  deprecation warning; no failure.

## 5. Assumptions Made

- Committing `app/web/dist` is acceptable for this repo because FastAPI serves
  built static assets directly and Python tests expect the UI to be available
  after checkout.
- Local dev-token minting is acceptable only for local/sandbox UI review and is
  explicitly rejected in production.
- KPI forecast confidence can be shown as the current simulation confidence
  until the backend exposes richer forecast intervals.
- The first MS2 slice should prioritize one honest end-to-end flow over filling
  every secondary dashboard widget.

## 6. Next Work

1. Add richer loading/empty/error substates per list and modal, especially for
   Campaigns, Creative, Tasks, and Audit.
2. Expand Dashboard with per-campaign media status, improvement-loop history,
   and explicit measured-vs-simulated grouping.
3. Add Kill Switch API wiring to the dashboard/settings surface with simulated
   status kept explicit.
4. Split operator-only controls from customer-facing read views by role.
5. Continue backend hardening in a separate stack:
   Firestore append-only transactions, legal normalization/severity review,
   real GA4/Shopify read adapters, Google Ads OAuth, and real stop/pause only
   after scope approval.

## 7. Awaiting Approval / Decisions

- Production token issuer and login/session design.
- Whether to introduce React before the UI grows beyond the lightweight
  TypeScript store/router layer.
- Exact customer-facing copy for role-separated views.
- Whether built `app/web/dist` should stay committed long-term or be produced by
  CI before Python packaging/deploy.
