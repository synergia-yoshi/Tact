# 2026-06-29 Kill Switch Status Snapshot

## 1. 対象の実体

Current SSoT is `synergia-yoshi/cursor` FastAPI MVP, local branch `codex/kill-switch-status` stacked on `codex/legal-check-api` commit `b8846ec2f9e199863f7099ae6522d0fad5192b17` / PR #8.

## 2. 今回やったこと

- Added `KillSwitchResult` model with explicit `data_kind`.
- Added media delivery status request/response boundary to the media adapter.
- Implemented mock media delivery status as `simulated`.
- Added Kill Switch APIs:
  - `POST /api/v1/campaigns/{campaign_id}/kill-switch/evaluate`
  - `GET /api/v1/campaigns/{campaign_id}/kill-switch/latest`
- Persisted Kill Switch evaluation results on campaign proposals.
- Added audit entry `campaign.kill_switch.evaluated`.
- Added tests for:
  - latest result 404 before evaluation.
  - unpublished campaigns explicitly reporting no real stop action.
  - published mock campaigns reporting simulated media status and no real stop mutation.
- Updated README.

## 3. 現在地

- 動くもの:
  - Kill Switch evaluation exists and is audited.
  - Mock media status is explicitly marked `simulated`.
  - The API does not claim a real stop happened when only mock media exists.
  - Published mock campaigns evaluate media status through the adapter boundary.
- まだ動かないもの:
  - No real media stop/pause API is connected.
  - No emergency stop mutation is executed for live media.
  - No role-gated emergency-stop approval flow yet.
  - No UI display of Kill Switch status yet.
- 既知の不具合/リスク:
  - Current Kill Switch is a simulated evaluation, not a production stop mechanism.
  - Real media adapter must implement measured delivery status and stop/pause mutation before production claims.

## 4. 検証結果

- `.\.venv312\Scripts\python.exe -m pytest` passed: 27 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- Full package install/diff check will be rerun before commit/PR.
- Warning observed: FastAPI/Starlette TestClient emits a deprecation warning recommending `httpx2`; no test failure.

## 5. 置いた仮定

- Because real media APIs are not connected, Kill Switch should be explicit simulation rather than pretending to stop delivery.
- `would_stop`/`clear` evaluation can exist before real stop mutation; real `stopped` should require a live adapter.
- Production stop actions need role gating and audit before implementation.

## 6. 次にやること

1. Add reusable execution-vs-recommendation policy matrix and role gating.
2. Gate approval, legal override, audit verify, and future stop actions by role.
3. Add real GA4 + Shopify read adapters and account mapping.
4. Add Google Ads OAuth setup while keeping publish/budget changes `pending_approval`.
5. Add real media stop/pause adapter methods once OAuth/scopes are approved.

## 7. 承認待ち/要判断

- Which real media accounts/scopes can be paused by Tact is undecided.
- Who can execute emergency stop, and whether it needs second approval, is undecided.
- Real media publish, budget change, and campaign launch remain approval-gated and should not be automated without product/legal approval.
