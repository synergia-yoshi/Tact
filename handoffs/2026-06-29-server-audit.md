# 2026-06-29 Server Audit Snapshot

## 1. 対象の実体

Current SSoT is `synergia-yoshi/cursor` PR #1 FastAPI MVP, local branch `codex/server-authoritative-audit` based on `cursor/implement-mvp-v3-d9c9` at commit `9ec49646580cc3a5479662c871eb12ac8a4c87bd`.

## 2. 今回やったこと

- Added a server-generated `AuditEntry` model with canonical SHA-256 hashing.
- Added an append-only audit repository with `prev_hash`/`hash` chain continuity verification.
- Added campaign audit read and ledger verification APIs:
  - `GET /api/v1/campaigns/{campaign_id}/audit`
  - `GET /api/v1/campaigns/audit/verify`
- Changed publish behavior from immediate media mutation to a server-created `pending_approval` `AgentAction`.
- Added approve/reject endpoints for pending actions:
  - `POST /api/v1/campaigns/{campaign_id}/actions/{action_id}/approve`
  - `POST /api/v1/campaigns/{campaign_id}/actions/{action_id}/reject`
- Kept mock media publish behind approval: only approve calls the media adapter.
- Rejected client-supplied authority fields on campaign brief input with `extra="forbid"`.
- Updated README API docs and acceptance checklist.
- Changed `uvicorn[standard]` to `uvicorn` because Windows ARM validation failed on `httptools` C++ build; this MVP does not require the standard extra.

## 3. 現在地

- 動くもの:
  - Campaign proposal creation still works.
  - Server emits audit entries for proposal creation, publish request, approval, and rejection.
  - Publish request is idempotent while a pending action exists and does not duplicate audit entries.
  - Performance remains unavailable until a pending publish action is approved.
  - Audit hash-chain verification is available and tested.
- まだ動かないもの:
  - Audit/campaign state is still in-memory; Firestore or another durable store is not implemented yet.
  - Auth and tenant isolation are not implemented yet; `actor="human"` is a placeholder for the approval endpoint.
  - Policy matrix is represented only by the publish approval guardrail result, not yet as a reusable policy module.
  - GA4/Shopify/Google Ads measurement wiring is not implemented yet.
- 既知の不具合/リスク:
  - The review document referenced a `tact-mvp` `index.html`/`server.js`/`Dockerfile` body that was not present locally. This work applies the trust-architecture milestone to the available PR #1 FastAPI MVP.
  - In-memory audit prevents client API tampering but is not production-grade against process-level/state-store threats.

## 4. 検証結果

- `.\.venv312\Scripts\python.exe -m pip install -e ".[dev]"` passed.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 10 tests passed.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- Warning observed: FastAPI/Starlette TestClient emits a deprecation warning recommending `httpx2`; no test failure.
- Build/package note: editable package build passed after removing `uvicorn[standard]`.

## 5. 置いた仮定

- `synergia-yoshi/cursor` PR #1 is the current implementation SSoT for backend trust work.
- The next-sprint first milestone should land on the FastAPI API MVP rather than the removed/static prototype artifacts.
- Human approval can be represented by the approval endpoint until real auth supplies a verified actor identity.
- Durable persistence and tenant boundaries are deferred to the next milestones but should be implemented before any production claim.

## 6. 次にやること

1. Add Firestore-backed repositories for campaigns/actions/audit entries, keeping the append-only audit API shape.
2. Move secrets and runtime configuration to Secret Manager/runtime environment only.
3. Add real authentication and derive organization/actor identity from a verified token.
4. Enforce tenant boundaries in every repository query and add header-spoofing tests.
5. Extract the publish approval rule into a reusable policy matrix for execution vs recommendation.
6. Start measurement-first wiring: GA4 + Shopify read models before enabling outbound media operations.

## 7. 承認待ち/要判断

- GCP project, Firestore collection naming, and Secret Manager naming are not decided.
- Auth provider/IAP/IAM approach is not decided.
- Real media publish, budget change, and campaign launch remain approval-gated and should not be automated without product/legal approval.
- Whether to keep this work stacked on PR #1 or open a new PR branch from it needs human/GitHub workflow confirmation before pushing.
