# 2026-06-29 Measurement Read Models Snapshot

## 1. 対象の実体

Current SSoT is `synergia-yoshi/cursor` FastAPI MVP, local branch `codex/measurement-read-models` stacked on `codex/auth-tenant-isolation` commit `2e8da47364ec2bd9e9563934eff0c3f9831afa7b` / PR #6.

## 2. 今回やったこと

- Added `MetricSnapshot` with explicit `data_kind`, per-field labels, and confidence.
- Added a read-only measurement adapter boundary and deterministic `MockMeasurementAdapter`.
- Added `MEASUREMENT_ADAPTER=mock` setting and health/status visibility.
- Added measurement APIs:
  - `POST /api/v1/campaigns/{campaign_id}/measurements/refresh`
  - `GET /api/v1/campaigns/{campaign_id}/measurements/latest`
- Persisted metric snapshots on campaign proposals.
- Added audit entry `campaign.measurement.refreshed`.
- Changed publish flow so publish approval cannot be requested until a measurement snapshot exists.
- Added tests for measurement refresh/latest and publish-before-measurement rejection.
- Updated README and `.env.example`.

## 3. 現在地

- 動くもの:
  - GA4/Shopify-shaped read-only measurement boundary exists.
  - Mock measurement snapshots are clearly labeled as `simulated`.
  - Publish requests now return 409 until measurement is refreshed.
  - Measurement refresh is tenant-scoped through existing auth context.
  - Measurement refresh is audited before publish approval request.
- まだ動かないもの:
  - No real GA4 Admin/Data API or Shopify Admin API integration yet.
  - No Google Ads OAuth flow yet.
  - No UI dashboard yet for displaying measured/predicted/simulated labels.
  - No date range selection for measurement refresh yet.
- 既知の不具合/リスク:
  - Mock measurement numbers are deterministic simulations and must not be presented as real performance.
  - Real GA4/Shopify credentials, scopes, and account mapping are undecided.
  - Outbound media remains mock and approval-gated.

## 4. 検証結果

- `.\.venv312\Scripts\python.exe -m pytest` passed: 21 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- Full package install/diff check will be rerun before commit/PR.
- Warning observed: FastAPI/Starlette TestClient emits a deprecation warning recommending `httpx2`; no test failure.

## 5. 置いた仮定

- Because real GA4/Shopify credentials are not available locally, this milestone creates the read-only measurement boundary plus simulated labels.
- `MetricSnapshot.data_kind` and `labels` are the API-level trust boundary until UI display exists.
- Publish approval should require at least one measurement snapshot, even if the first snapshot is explicitly simulated.
- Google Ads OAuth/publication remains later because measurement must come first.

## 6. 次にやること

1. Add real GA4 + Shopify read adapters behind the measurement adapter interface.
2. Add account mapping and date range inputs for measurement refresh.
3. Add Google Ads OAuth setup while keeping publish/budget changes `pending_approval`.
4. Add reusable execution-vs-recommendation policy matrix and role gating.
5. Add legal-check API for 薬機法/景表法 wording review before campaign publish.

## 7. 承認待ち/要判断

- GA4 property/account IDs and Shopify shop/scopes are undecided.
- Whether simulated measurement is acceptable as the first PoC gate needs product approval.
- Google Ads OAuth app, scopes, and review path are undecided.
- Real media publish, budget change, and campaign launch remain approval-gated and should not be automated without product/legal approval.
