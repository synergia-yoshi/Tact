# 2026-06-29 Legal Check API Snapshot

## 1. 対象の実体

Current SSoT is `synergia-yoshi/cursor` FastAPI MVP, local branch `codex/legal-check-api` stacked on `codex/measurement-read-models` commit `8681fe2a73bcd5fc67322cb5ba7db1d97d68653b` / PR #7.

## 2. 今回やったこと

- Added rule-based legal check models:
  - `LegalCheckResult`
  - `LegalFinding`
- Added dictionary/rule checks for:
  - 薬機法系の治癒/治療表現
  - 景表法系の絶対/100%/永久などの断定表現
  - No.1/日本一などの優良誤認リスク表現
- Added legal check APIs:
  - `POST /api/v1/campaigns/{campaign_id}/legal-checks/run`
  - `GET /api/v1/campaigns/{campaign_id}/legal-checks/latest`
- Persisted legal check results on campaign proposals.
- Added audit entry `campaign.legal_check.completed`.
- Changed publish flow so publish approval cannot be requested until the latest legal check is `passed`.
- Added unit tests for pass/review/block rule outcomes.
- Added API tests for legal latest/run flow.
- Updated README.

## 3. 現在地

- 動くもの:
  - Legal check actually evaluates campaign creative text.
  - Medical cure/treatment claims are blocked.
  - Absolute/No.1 superiority claims require review.
  - Publish now requires both measurement snapshot and passed legal check.
  - Legal check result is audited before publish approval request.
- まだ動かないもの:
  - Rule dictionary is intentionally small and not a full legal review engine.
  - No jurisdiction/category-specific rule packs yet.
  - No human legal review workflow for `needs_review` yet.
  - No UI display of legal findings yet.
- 既知の不具合/リスク:
  - The rule-based result is an initial guardrail, not legal advice.
  - Cosmetic/EC-specific claim dictionaries need product/legal review before production.
  - `needs_review` currently blocks publish because only `passed` allows publish approval.

## 4. 検証結果

- `.\.venv312\Scripts\python.exe -m pytest` passed: 25 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- Full package install/diff check will be rerun before commit/PR.
- Warning observed: FastAPI/Starlette TestClient emits a deprecation warning recommending `httpx2`; no test failure.

## 5. 置いた仮定

- A small rule-based legal check is preferable to UI claims that imply legal automation without implementation.
- Publish should require `passed`; `needs_review` and `blocked` should not proceed to publish approval.
- Human legal review workflow and richer dictionaries can be added after this first guardrail exists.

## 6. 次にやること

1. Add human review workflow for legal `needs_review` results.
2. Expand rule packs with product/legal input for EC/beauty claims.
3. Add reusable execution-vs-recommendation policy matrix and role gating.
4. Add Google Ads OAuth setup while keeping publish/budget changes `pending_approval`.
5. Add Kill Switch real-status integration or keep it explicitly simulated.

## 7. 承認待ち/要判断

- Legal dictionary contents and wording severity need legal/product approval.
- Whether `needs_review` can be manually overridden, by whom, and how to audit that override is undecided.
- Real media publish, budget change, and campaign launch remain approval-gated and should not be automated without product/legal approval.
