# Tact Handoff Snapshot: UI MS2 Vite Vertical Slice

## 1. Target SSoT

Repo: `synergia-yoshi/cursor`
Branch: `codex/ui-ms2-vite-vertical-slice`
Base: PR #11 / `c2e8cea`

Visual SSoT is root `design-reference.html`, treated as read-only. Runtime SSoT
is the FastAPI backend; UI state is derived from API responses.

## 2. What Changed

- Migrated authored UI to Vite + TypeScript under `app/web/src`.
- FastAPI now serves built Vite assets from `app/web/dist`.
- Added typed API client, small store module, lightweight route switching, and
  Chart.js dashboard rendering.
- Expanded sidebar to seven items:
  Home / Campaigns / Dashboard / Tasks / Creative / Audit / Settings.
- Added local-only signed-bearer dev token endpoint for UI role review.
- Added `autonomy_level` to `CampaignBrief`.
- Wired the MS2 vertical slice:
  Home -> proposal -> measurement/legal gate -> pending publish approval ->
  approver/admin approval -> dashboard.
- Kept publish and budget mutation under approval semantics; no client authority
  over campaign state or audit.
- Added escaping utility and XSS unit coverage for server-derived strings.

## 3. Current State

Working:

- Proposal creation renders server creative and media plan.
- KPI forecasts show ranges and simulation/confidence labels.
- Publish start runs measurement refresh and legal check before requesting
  `pending_approval`.
- Operator is blocked from approval; approver/admin can submit the mock media
  publish action.
- Dashboard is first-class and uses MetricSnapshot data labels.
- Audit feed reads server audit entries; verify remains admin-only.

Still mock/simulated:

- GA4/Shopify measurements.
- Media publish/review URL.
- Kill Switch stop behavior.
- Local dev token minting.

## 4. Validation

- `npm run build` passed.
- `npm run test` passed.
- `npm run test:e2e` passed.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 38 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.

Known warning: existing FastAPI/Starlette TestClient `httpx2` deprecation
warning only.

## 5. Assumptions Made

- `app/web/dist` is committed so FastAPI can serve the UI immediately after
  checkout and Python UI tests do not require an implicit Node build.
- Vite + TypeScript with a lightweight store is enough for MS2; React can be
  introduced later if component/state complexity justifies it.
- Dev-token minting is local/sandbox-only and blocked in production.
- Forecast confidence uses current simulated MetricSnapshot confidence until a
  richer forecast model lands.

## 6. Next Work

1. Refine per-view loading/empty/error states as lists become richer.
2. Expand Dashboard with improvement-loop history, media status, and Kill
   Switch API wiring while keeping mock status explicit.
3. Separate customer-facing read views from operator controls by role.
4. Continue backend hardening separately:
   Firestore transaction append-only audit, legal dictionary normalization,
   real GA4/Shopify read adapters, Google Ads OAuth, and scoped real stop/pause.

## 7. Awaiting Approval / Decisions

- Production auth/token issuer and session UX.
- Long-term decision on committing `app/web/dist` versus CI build-before-package.
- Whether to introduce React before the next larger UI milestone.
- Customer-facing copy for role-separated screens.
