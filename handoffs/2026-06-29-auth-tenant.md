# 2026-06-29 Auth Tenant Snapshot

## 1. 対象の実体

Current SSoT is `synergia-yoshi/cursor` FastAPI MVP, local branch `codex/auth-tenant-isolation` stacked on `codex/firestore-secret-manager` commit `0cf8976511721ef1874ca2b42000e4f998d82502` / PR #5.

## 2. 今回やったこと

- Added signed bearer auth context support with verified `sub`, `org_id`, and `roles` claims.
- Added `AUTH_MODE=disabled|signed_bearer` and `AUTH_TOKEN_SECRET` settings.
- Added Secret Manager resolution support for `AUTH_TOKEN_SECRET=sm://...`.
- Added `org_id` and `created_by` to campaign proposals.
- Added `org_id` to audit entries.
- Scoped campaign repository `get`/`list` and audit `list_for_subject` by verified org.
- Threaded `AuthContext` through campaign create/list/get/publish/approve/reject/performance/audit APIs.
- Added API tests proving:
  - signed bearer mode requires Authorization.
  - invalid bearer tokens are rejected.
  - another org cannot fetch/list a campaign even when spoofing `x-tact-org`.
- Updated README and `.env.example` with auth/tenant boundary guidance.

## 3. 現在地

- 動くもの:
  - Local dev remains usable with `AUTH_MODE=disabled`, using fixed `dev-org` / `dev-user`.
  - Server mode can require signed bearer tokens with org/actor derived from verified token claims.
  - Campaign and campaign-audit reads are tenant-scoped.
  - Client-supplied tenant headers are ignored.
  - Existing server-authoritative audit and pending-approval publish flow still pass.
- まだ動かないもの:
  - No external IdP/JWKS integration yet.
  - No Cloud Run IAP/IAM deployment change is included in code.
  - Role permissions are carried in `AuthContext` but not yet enforced by policy matrix.
  - Firestore tenant queries currently filter in repository code; live indexed query strategy is still pending.
- 既知の不具合/リスク:
  - `AUTH_MODE=disabled` must not be used in production.
  - HMAC signed bearer is a backend-verifiable MVP token format, not the final IdP integration.
  - Audit verification remains global; admin scoping/role gating should be added before production exposure.

## 4. 検証結果

- `.\.venv312\Scripts\python.exe -m pytest` passed: 20 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- Warning observed: FastAPI/Starlette TestClient emits a deprecation warning recommending `httpx2`; no test failure.
- Full package install/diff check will be rerun before commit/PR.

## 5. 置いた仮定

- Because the final auth provider is undecided, signed bearer auth is the smallest testable verified-token boundary.
- `org_id` from the verified token is the tenant SSoT; headers such as `x-tact-org` are ignored.
- Local development may remain unauthenticated only under explicit `AUTH_MODE=disabled`.
- Production should use Secret Manager for `AUTH_TOKEN_SECRET` until the real IdP/JWKS/IAP design lands.

## 6. 次にやること

1. Add a reusable execution-vs-recommendation policy matrix and enforce role/action approval gates.
2. Gate audit verification and approval endpoints by role.
3. Add Firestore transaction support for audit append before live concurrent use.
4. Add Cloud Run/IAP/IAM deployment docs once the hosting target is confirmed.
5. Start GA4 + Shopify read-only measurement wiring before outbound media operations.

## 7. 承認待ち/要判断

- Final auth provider, JWKS/IAP/IAM approach, and token claim contract are undecided.
- Production must decide whether `signed_bearer` is acceptable as an interim service-token mode.
- GCP project ID, Firestore collection/index strategy, and Secret Manager names remain undecided.
- Real media publish, budget change, and campaign launch remain approval-gated and should not be automated without product/legal approval.
