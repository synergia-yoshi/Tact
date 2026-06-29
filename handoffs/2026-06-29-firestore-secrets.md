# 2026-06-29 Firestore Secrets Snapshot

## 1. 対象の実体

Current SSoT is `synergia-yoshi/cursor` FastAPI MVP, local branch `codex/firestore-secret-manager` stacked on `codex/server-authoritative-audit` commit `567759cb145b02c3ab7972f021f2d1db549adab5` / PR #4.

## 2. 今回やったこと

- Added Firestore-backed campaign and audit repository implementations behind `STORAGE_BACKEND=firestore`.
- Added repository bundle dependency selection so local/test keeps `STORAGE_BACKEND=memory` by default.
- Added optional GCP dependencies under `pip install -e ".[gcp]"`.
- Added Secret Manager reference resolution boundary for `sm://...` values.
- Added Firestore configuration fields:
  - `GCP_PROJECT_ID`
  - `FIRESTORE_DATABASE`
  - `FIRESTORE_COLLECTION_PREFIX`
- Updated `.env.example` and README with persistence and secret configuration.
- Added fake-Firestore tests for campaign round-trip and audit hash-chain verification.
- Added Secret Manager resolver tests.
- Kept health output secret-safe while exposing only non-secret storage backend status.

## 3. 現在地

- 動くもの:
  - In-memory backend remains default and fully tested.
  - Firestore repositories can save/load campaign proposals and append/verify audit entries through a Firestore-shaped client.
  - Firestore audit ordering is reconstructed from the `prev_hash` chain instead of relying on stream order.
  - Secret Manager refs can be represented as `sm://projects/<project>/secrets/<name>/versions/<version>` and resolved server-side.
  - Public health/status output includes adapter/storage kinds but not project IDs, API keys, or secret refs.
- まだ動かないもの:
  - Live Firestore integration has not been exercised against a real GCP project.
  - Firestore audit append is not yet transaction-protected against concurrent writers.
  - Secret Manager resolver is present but real LLM/media adapters are still not implemented, so no production key is consumed yet.
  - Auth and tenant isolation are still not implemented.
- 既知の不具合/リスク:
  - Firestore backend requires `pip install -e ".[gcp]"` and runtime GCP credentials.
  - The current in-memory backend remains unsafe for production persistence.
  - Live Secret Manager and Firestore IAM permissions are not validated locally.

## 4. 検証結果

- `.\.venv312\Scripts\python.exe -m pip install -e ".[dev]"` passed.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 17 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.
- Warning observed: FastAPI/Starlette TestClient emits a deprecation warning recommending `httpx2`; no test failure.

## 5. 置いた仮定

- GCP project/credentials are not available in this local environment, so P1-1 is implemented as production-shaped adapters plus fake-client tests.
- `STORAGE_BACKEND=memory` should remain the local default until Firestore project/IAM details are confirmed.
- Secret Manager refs should be resolved only on the server and only when a config value explicitly uses `sm://...`.
- Transactional Firestore append can be handled in the next hardening pass once the live collection strategy is approved.

## 6. 次にやること

1. Add real auth scaffolding and derive actor/org from verified identity.
2. Enforce tenant boundaries in campaign/audit repository methods.
3. Add spoofing tests proving `x-tact-org`-style headers cannot cross tenant data.
4. Wrap Firestore audit append in a transaction when live GCP details are available.
5. Extract publish approval into a reusable execution-vs-recommendation policy matrix.
6. Start GA4 + Shopify read-only measurement wiring before enabling outbound media operations.

## 7. 承認待ち/要判断

- GCP project ID, Firestore database, collection prefix, and IAM service account are not decided.
- Secret Manager secret names and rotation policy are not decided.
- Auth provider/IAP/IAM approach is not decided.
- Real media publish, budget change, and campaign launch remain approval-gated and should not be automated without product/legal approval.
